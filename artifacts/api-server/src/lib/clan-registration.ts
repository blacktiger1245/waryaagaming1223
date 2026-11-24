import { db, clanRegistrationsTable, tournamentParticipantsTable, tournamentsTable } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import type Stripe from "stripe";
import { logger } from "./logger";

/**
 * Paid clan-tournament registration.
 *
 * A clan tournament can charge an entry fee. The clan pays either by card
 * (Stripe Checkout — the `checkout.session.completed` webhook confirms it) or by
 * EVC Plus (manual mobile money — an admin confirms it). Both confirmations end
 * up here, so the "insert the participant row" step exists exactly once and can
 * never register a clan twice.
 */
export const CLAN_REGISTRATION_KIND = "clan_registration";

/** Count a tournament's participants from the real rows, not the cached column. */
async function countParticipants(tournamentId: number): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(tournamentParticipantsTable)
    .where(eq(tournamentParticipantsTable.tournamentId, tournamentId));
  return Number(row?.count ?? 0);
}

/**
 * Register a clan for a tournament — exactly once.
 *
 * Safe to call from the Stripe webhook (at-least-once delivery) and from the
 * admin EVC Plus approval: an existing participant row is reused rather than
 * duplicated, and the cached participant counter is resynced afterwards.
 */
export async function registerTeamParticipant(
  tournamentId: number,
  teamId: number,
): Promise<{ created: boolean; currentParticipants: number }> {
  const [existing] = await db
    .select({ id: tournamentParticipantsTable.id })
    .from(tournamentParticipantsTable)
    .where(
      and(
        eq(tournamentParticipantsTable.tournamentId, tournamentId),
        eq(tournamentParticipantsTable.teamId, teamId),
      ),
    );

  if (!existing) {
    await db
      .insert(tournamentParticipantsTable)
      .values({ tournamentId, type: "team", playerId: null, teamId })
      .onConflictDoNothing();
  }

  const current = await countParticipants(tournamentId);
  await db
    .update(tournamentsTable)
    .set({ currentParticipants: current })
    .where(eq(tournamentsTable.id, tournamentId));

  return { created: !existing, currentParticipants: current };
}

/**
 * Persist a clan's chosen playing line-up for a tournament.
 *
 * A clan tournament can cap the players per team (`tournaments.players_per_team`)
 * and the President/Coach picks the line-up (player vs player) while registering.
 * A PAID entry stores the selection on the registration row first (it has to
 * survive the Stripe redirect / admin approval), so this is called the moment the
 * fee is settled — from the Stripe webhook and from the admin EVC Plus approval
 * alike. Idempotent: the unique key makes a repeat insert a no-op.
 */
export async function saveTournamentLineup(
  tournamentId: number,
  teamId: number,
  playerIds: readonly number[] | null | undefined,
): Promise<number> {
  const ids = Array.isArray(playerIds)
    ? [...new Set(playerIds.filter((id) => Number.isInteger(id) && id > 0))]
    : [];
  for (const playerId of ids) {
    await db.execute(
      sql`INSERT INTO "tournament_team_rosters" ("tournament_id", "team_id", "player_id")
          VALUES (${tournamentId}, ${teamId}, ${playerId})
          ON CONFLICT ("tournament_id", "team_id", "player_id") DO NOTHING`,
    );
  }
  return ids.length;
}

/**
 * Confirm a Stripe-paid clan registration and register the clan.
 *
 * Idempotent by construction: the registration is found through the unique
 * `stripe_session_id` (falling back to the id in the session metadata), the
 * status transition happens at most once, and `registerTeamParticipant` reuses an
 * existing participant row — so a redelivered webhook cannot register a clan
 * twice or charge it again.
 */
export async function fulfillClanRegistration(
  session: Stripe.Checkout.Session,
): Promise<"approved" | "already-approved" | "not-found"> {
  const metadataRegistrationId = Number(session.metadata?.["registrationId"]);

  const [bySession] = await db
    .select()
    .from(clanRegistrationsTable)
    .where(eq(clanRegistrationsTable.stripeSessionId, session.id));

  let registration = bySession;
  if (!registration && Number.isInteger(metadataRegistrationId) && metadataRegistrationId > 0) {
    [registration] = await db
      .select()
      .from(clanRegistrationsTable)
      .where(eq(clanRegistrationsTable.id, metadataRegistrationId));
  }

  if (!registration) {
    logger.warn(
      { sessionId: session.id, registrationId: session.metadata?.["registrationId"] },
      "Stripe clan-registration session has no matching registration row",
    );
    return "not-found";
  }

  if (registration.status === "approved") return "already-approved";

  await db
    .update(clanRegistrationsTable)
    .set({
      status: "approved",
      stripeSessionId: session.id,
      reviewedAt: new Date(),
      reviewNote: "Paid by card through Stripe Checkout",
    })
    .where(and(eq(clanRegistrationsTable.id, registration.id), sql`${clanRegistrationsTable.status} <> 'approved'`));

  const { currentParticipants } = await registerTeamParticipant(registration.tournamentId, registration.teamId);
  // The President/Coach chose the playing line-up while registering; apply it now
  // that the fee is settled so the tournament roster is never empty.
  const lineupSaved = await saveTournamentLineup(
    registration.tournamentId,
    registration.teamId,
    registration.playerIds,
  );

  logger.info(
    {
      registrationId: registration.id,
      tournamentId: registration.tournamentId,
      teamId: registration.teamId,
      currentParticipants,
      lineupSaved,
    },
    "Clan tournament entry fee paid — clan registered automatically",
  );
  return "approved";
}
