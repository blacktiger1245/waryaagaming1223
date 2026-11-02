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

  logger.info(
    {
      registrationId: registration.id,
      tournamentId: registration.tournamentId,
      teamId: registration.teamId,
      currentParticipants,
    },
    "Clan tournament entry fee paid — clan registered automatically",
  );
  return "approved";
}
