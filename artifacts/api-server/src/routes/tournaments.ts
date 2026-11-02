import { Router } from "express";
import { db } from "@workspace/db";
import {
  tournamentsTable,
  tournamentParticipantsTable,
  matchesTable,
  playersTable,
  teamsTable,
  tournamentAdminsTable,
  clanRegistrationsTable,
} from "@workspace/db";
import { eq, and, desc, sql, inArray } from "drizzle-orm";
import { getStripe, isStripeConfigured } from "../lib/stripe";
import { CLAN_REGISTRATION_KIND, registerTeamParticipant } from "../lib/clan-registration";
import {
  ListTournamentsQueryParams,
  CreateTournamentBody,
  GetTournamentParams,
  RegisterForTournamentParams,
  RegisterForTournamentBody,
  GetTournamentBracketParams,
  GetTournamentMatchesParams,
} from "@workspace/api-zod";
import { resolveAndStoreTournamentWinner } from "../lib/tournament-winner";

const router = Router();

/**
 * Count the real number of registered participants for a tournament.
 * The stored `current_participants` column is only a cached counter and can drift
 * (deleted teams/players, legacy rows), so every read path derives the count from
 * the `tournament_participants` table instead.
 */
async function countParticipants(tournamentId: number): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(tournamentParticipantsTable)
    .where(eq(tournamentParticipantsTable.tournamentId, tournamentId));
  return Number(row?.count ?? 0);
}

/** Keep the cached counter in sync with reality (best effort, never throws). */
async function syncParticipantCount(tournamentId: number): Promise<number> {
  const count = await countParticipants(tournamentId);
  await db
    .update(tournamentsTable)
    .set({ currentParticipants: count })
    .where(eq(tournamentsTable.id, tournamentId));
  return count;
}

router.get("/tournaments", async (req, res) => {
  const query = ListTournamentsQueryParams.safeParse(req.query);
  if (!query.success) return res.status(400).json({ error: "Invalid query" });

  const { status } = query.data;
  const tournaments = await db
    .select()
    .from(tournamentsTable)
    .where(status ? eq(tournamentsTable.status, status) : undefined)
    .orderBy(sql`COALESCE(${tournamentsTable.startDate}, '9999-12-31')`, tournamentsTable.createdAt);

  // Derive the registered-participant count for every tournament in one query so
  // the UI can always render "registered / max" (e.g. 0/16, 1/16, 2/16).
  const counts = await db
    .select({
      tournamentId: tournamentParticipantsTable.tournamentId,
      count: sql<number>`count(*)::int`,
    })
    .from(tournamentParticipantsTable)
    .groupBy(tournamentParticipantsTable.tournamentId);
  const countMap = new Map(counts.map((row) => [row.tournamentId, Number(row.count)]));

  // Never show "Winner: TBD" for a finished tournament — resolve the champion
  // from the final (knock-out) or the standings (league) on first read.
  const withWinners = await Promise.all(
    tournaments.map(async (t) => {
      if (t.winnerName || t.status === "upcoming") return t;
      try {
        const winner = await resolveAndStoreTournamentWinner(t);
        return winner.name ? { ...t, winnerName: winner.name } : t;
      } catch {
        return t;
      }
    }),
  );

  return res.json(
    withWinners.map((t) => ({
      ...t,
      currentParticipants: countMap.get(t.id) ?? 0,
      createdAt: t.createdAt.toISOString(),
    })),
  );
});

router.post("/tournaments", async (req, res) => {
  if (!req.session?.userId) return res.status(401).json({ error: "Login with Discord first" });
  const role = req.session?.role;
  const isStaff = role === "admin" || role === "owner" || !!req.session?.isAdmin;
  if (!isStaff) {
    return res.status(403).json({ error: "Only admins and owners can create tournaments" });
  }
  const body = CreateTournamentBody.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Invalid body" });

  const status = (req.body as { status?: string }).status ?? "upcoming";
  if (status === "upcoming" && !body.data.startDate) {
    return res.status(400).json({ error: "startDate is required for upcoming tournaments" });
  }

  // A tournament created straight into "active" starts today — the creation date
  // is its start date, so the UI never shows "Start Date: TBD".
  const startDate =
    body.data.startDate ??
    (status === "active" || status === "completed" ? new Date().toISOString().slice(0, 10) : undefined);

  const [tournament] = await db.insert(tournamentsTable).values({
    ...body.data,
    startDate,
    status,
    teamCount: body.data.teamCount ?? undefined,
    isClanTournament: body.data.isClanTournament ?? false,
    createdBy: req.session.userId,
  }).returning();
  await db.insert(tournamentAdminsTable).values({
    tournamentId: tournament.id,
    playerId: req.session.userId,
    role: "owner",
  });
  return res.status(201).json({ ...tournament, createdAt: tournament.createdAt.toISOString() });
});

async function canManageTournament(tournamentId: number, userId: number) {
  const [tournament] = await db
    .select({ createdBy: tournamentsTable.createdBy })
    .from(tournamentsTable)
    .where(eq(tournamentsTable.id, tournamentId));
  if (!tournament) return { tournament: null, allowed: false };
  if (tournament.createdBy === userId) return { tournament, allowed: true };
  const [admin] = await db
    .select({ id: tournamentAdminsTable.id })
    .from(tournamentAdminsTable)
    .where(and(eq(tournamentAdminsTable.tournamentId, tournamentId), eq(tournamentAdminsTable.playerId, userId)));
  return { tournament, allowed: !!admin };
}

function hasGlobalAdminAccess(req: import("express").Request) {
  return req.session.role === "admin" || req.session.role === "owner" || !!req.session.isAdmin;
}

router.get("/tournaments/:id/admins", async (req, res) => {
  const tournamentId = Number(req.params.id);
  if (Number.isNaN(tournamentId)) return res.status(400).json({ error: "Invalid tournament id" });
  const admins = await db
    .select({
      id: tournamentAdminsTable.id,
      playerId: tournamentAdminsTable.playerId,
      role: tournamentAdminsTable.role,
      username: playersTable.username,
      displayName: playersTable.displayName,
      avatarUrl: playersTable.avatarUrl,
    })
    .from(tournamentAdminsTable)
    .innerJoin(playersTable, eq(tournamentAdminsTable.playerId, playersTable.id))
    .where(eq(tournamentAdminsTable.tournamentId, tournamentId));
  return res.json(admins);
});

router.post("/tournaments/:id/admins", async (req, res) => {
  if (!req.session?.userId) return res.status(401).json({ error: "Login with Discord first" });
  const tournamentId = Number(req.params.id);
  const playerId = Number(req.body?.playerId);
  if (Number.isNaN(tournamentId) || !Number.isInteger(playerId)) return res.status(400).json({ error: "A valid playerId is required" });
  const access = await canManageTournament(tournamentId, req.session.userId);
  if (!access.tournament) return res.status(404).json({ error: "Tournament not found" });
  if (!access.allowed && !hasGlobalAdminAccess(req)) return res.status(403).json({ error: "Only the tournament owner or an admin can manage admins" });
  const [player] = await db.select({ id: playersTable.id }).from(playersTable).where(eq(playersTable.id, playerId));
  if (!player) return res.status(404).json({ error: "Player not found" });
  const [admin] = await db.insert(tournamentAdminsTable).values({ tournamentId, playerId, role: "admin" })
    .onConflictDoNothing().returning();
  return res.status(admin ? 201 : 200).json({ ok: true, adminId: admin?.id ?? null });
});

router.delete("/tournaments/:id/admins/:playerId", async (req, res) => {
  if (!req.session?.userId) return res.status(401).json({ error: "Login with Discord first" });
  const tournamentId = Number(req.params.id);
  const playerId = Number(req.params.playerId);
  if (Number.isNaN(tournamentId) || Number.isNaN(playerId)) return res.status(400).json({ error: "Invalid id" });
  const access = await canManageTournament(tournamentId, req.session.userId);
  if (!access.tournament) return res.status(404).json({ error: "Tournament not found" });
  if (!access.allowed && !hasGlobalAdminAccess(req)) return res.status(403).json({ error: "Only the tournament owner or an admin can manage admins" });
  if (playerId === access.tournament.createdBy) return res.status(400).json({ error: "The tournament owner cannot be removed" });
  await db.delete(tournamentAdminsTable).where(and(eq(tournamentAdminsTable.tournamentId, tournamentId), eq(tournamentAdminsTable.playerId, playerId)));
  return res.json({ ok: true });
});

router.get("/tournaments/:id", async (req, res) => {
  const params = GetTournamentParams.safeParse(req.params);
  if (!params.success) return res.status(400).json({ error: "Invalid params" });

  const [tournament] = await db
    .select()
    .from(tournamentsTable)
    .where(eq(tournamentsTable.id, params.data.id));

  if (!tournament) return res.status(404).json({ error: "Tournament not found" });

  // Resolve the champion on read so the header never shows "Winner: TBD" for a
  // tournament whose results are already decided.
  let winnerName = tournament.winnerName;
  if (!winnerName && tournament.status !== "upcoming") {
    try {
      const winner = await resolveAndStoreTournamentWinner(tournament);
      winnerName = winner.name ?? null;
    } catch {
      // Never fail the page just because the champion could not be derived.
    }
  }

  // Always report the live registered count (e.g. 0/16 → 1/16 after a join).
  const registered = await countParticipants(tournament.id);
  return res.json({
    ...tournament,
    winnerName,
    currentParticipants: registered,
    createdAt: tournament.createdAt.toISOString(),
  });
});

/**
 * GET /tournaments/:id/my-registration
 * Returns whether the currently-logged-in Discord user is already registered.
 */
router.get("/tournaments/:id/my-registration", async (req, res) => {
  const id = Number(req.params.id);
  if (!req.session?.userId) return res.json({ registered: false });

  const [player] = await db
    .select({ id: playersTable.id, teamId: playersTable.teamId })
    .from(playersTable)
    .where(eq(playersTable.id, req.session.userId));

  if (!player) return res.json({ registered: false });

  const [existing] = await db
    .select({ id: tournamentParticipantsTable.id })
    .from(tournamentParticipantsTable)
    .where(
      and(
        eq(tournamentParticipantsTable.tournamentId, id),
        eq(tournamentParticipantsTable.playerId, player.id)
      )
    );
  if (existing) return res.json({ registered: true, asTeam: false });

  // Clan/team tournaments: the user counts as registered if their TEAM is registered.
  if (player.teamId) {
    const [teamPart] = await db
      .select({ id: tournamentParticipantsTable.id })
      .from(tournamentParticipantsTable)
      .where(
        and(
          eq(tournamentParticipantsTable.tournamentId, id),
          eq(tournamentParticipantsTable.teamId, player.teamId)
        )
      );
    if (teamPart) return res.json({ registered: true, asTeam: true });
  }

  return res.json({ registered: false });
});

/**
 * Shared team-registration logic for clan tournaments.
 * Validates open status, capacity, team membership and the President/Coach role
 * (all from the DB), then inserts a team participant. Sends the response itself.
 */
async function registerTeamForTournament(
  tournament: typeof tournamentsTable.$inferSelect,
  req: import("express").Request,
  res: import("express").Response
) {
  const id = tournament.id;
  if (tournament.status === "completed" || tournament.status === "cancelled")
    return res.status(400).json({ error: "Tournament is no longer open for registration" });

  // Capacity is checked against the real registered rows, never the cached column.
  const registered = await countParticipants(id);
  if (registered >= tournament.maxParticipants)
    return res.status(400).json({ error: "Tournament is full" });

  const uid = req.session?.userId;
  if (uid == null) return res.status(401).json({ error: "Login with Discord first" });
  const [player] = await db
    .select()
    .from(playersTable)
    .where(eq(playersTable.id, uid));
  if (!player) return res.status(400).json({ error: "Player profile not found" });
  if (!player.teamId)
    return res.status(403).json({ error: "You are not on a team — only a team President or Coach can register their team" });

  const [team] = await db.select().from(teamsTable).where(eq(teamsTable.id, player.teamId));
  if (!team) return res.status(400).json({ error: "Team not found" });

  // Role gate: only President or Coach can register the team.
  const isPresident = team.presidentId === player.id;
  const isCoach = (team as { coachId?: number | null }).coachId === player.id;
  if (!isPresident && !isCoach) {
    return res.status(403).json({ error: "Only the team President or Coach can register the team" });
  }

  const [existing] = await db
    .select({ id: tournamentParticipantsTable.id })
    .from(tournamentParticipantsTable)
    .where(
      and(
        eq(tournamentParticipantsTable.tournamentId, id),
        eq(tournamentParticipantsTable.teamId, team.id)
      )
    );
  if (existing) return res.status(409).json({ error: "Your team is already registered" });

  // ── Entry fee ──────────────────────────────────────────────────────────────
  // A paid clan tournament is never registered for free: the clan must pay first
  // (Stripe card → the webhook registers it automatically, or EVC Plus → an admin
  // approves the transfer). Nothing is inserted here, so an unpaid clan can never
  // take a slot.
  if (tournament.registrationFeeCents > 0) {
    return res.status(402).json({
      error: "This tournament has an entry fee — choose a payment method to register your clan.",
      code: "registration_fee_required",
      feeCents: tournament.registrationFeeCents,
      methods: [
        { id: "stripe", label: "Debit / Credit card", available: isStripeConfigured() },
        { id: "evcplus", label: "EVC Plus", available: Boolean(tournament.evcPlusNumber) },
      ],
    });
  }

  // Optional playing roster (player vs player). Registration itself only needs the
  // clan — the coach may add the line-up later, so an empty selection is accepted.
  const body = (req.body ?? {}) as { playerIds?: unknown };
  const playersPerTeam = tournament.playersPerTeam != null ? tournament.playersPerTeam : null;
  let playerIds: number[] = [];
  if (playersPerTeam != null && playersPerTeam > 0) {
    const raw = Array.isArray(body.playerIds) ? body.playerIds : [];
    playerIds = raw.filter((x): x is number => typeof x === "number" && Number.isInteger(x) && x > 0);
    if (playerIds.length > playersPerTeam) {
      return res.status(400).json({ error: `You reached the maximum of ${playersPerTeam} players (player vs player). You selected ${playerIds.length}.` });
    }
    if (playerIds.length > 0) {
      const teamMembers = await db
        .select({ id: playersTable.id })
        .from(playersTable)
        .where(and(eq(playersTable.teamId, team.id), inArray(playersTable.id, playerIds)));
      if (teamMembers.length !== playerIds.length) {
        return res.status(403).json({ error: "Some selected players are not on your team." });
      }
    }
  }
  const [participant] = await db
    .insert(tournamentParticipantsTable)
    .values({ tournamentId: id, type: "team", playerId: null, teamId: team.id })
    .returning();

  const newCount = await syncParticipantCount(id);

  // Store the coach's chosen playing roster (player vs player) for this team.
  if (playerIds.length > 0) {
    for (const pid of playerIds) {
      await db.execute(
        sql`INSERT INTO "tournament_team_rosters" ("tournament_id", "team_id", "player_id")
            VALUES (${id}, ${team.id}, ${pid})
            ON CONFLICT ("tournament_id", "team_id", "player_id") DO NOTHING`
      );
    }
  }

  return res.status(201).json({
    ...participant,
    teamName: team.name,
    seed: null,
    playersSelected: playerIds.length,
    playersPerTeam: playersPerTeam ?? null,
    currentParticipants: newCount,
  });
}

/**
 * POST /tournaments/:id/register-team
/**
 * POST /tournaments/:id/register-team
 * Clan tournaments: registers the logged-in user's TEAM as a participant.
 * Only the team President or Coach may register the team (roles come from the DB).
 */
router.post("/tournaments/:id/register-team", async (req, res) => {
  const id = Number(req.params.id);
  if (!req.session?.userId) return res.status(401).json({ error: "Login with Discord first" });

  const [tournament] = await db
    .select()
    .from(tournamentsTable)
    .where(eq(tournamentsTable.id, id));
  if (!tournament) return res.status(404).json({ error: "Tournament not found" });
  if (!tournament.isClanTournament)
    return res.status(400).json({ error: "This is not a clan tournament" });

  return registerTeamForTournament(tournament, req, res);
});

/**
 * POST /tournaments/:id/register-me
 * Auto-registers the logged-in Discord user as a player participant.
 * Creates a player row if one doesn't exist yet.
 */
router.post("/tournaments/:id/register-me", async (req, res) => {
  const id = Number(req.params.id);
  if (!req.session?.userId) return res.status(401).json({ error: "Login with Discord first" });

  const [tournament] = await db
    .select()
    .from(tournamentsTable)
    .where(eq(tournamentsTable.id, id));

  if (!tournament) return res.status(404).json({ error: "Tournament not found" });
  if (tournament.status === "completed" || tournament.status === "cancelled")
    return res.status(400).json({ error: "Tournament is no longer open for registration" });

  // Clan tournaments are team-registration only. If the caller is the team
  // President or Coach, register their WHOLE team (delegate to the shared
  // team-registration logic); otherwise reject with an explanatory error.
  if (tournament.isClanTournament) {
    return registerTeamForTournament(tournament, req, res);
  }

  // Upcoming tournaments only allow registration once the start date is reached.
  if (tournament.status === "upcoming" && tournament.startDate) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = new Date(tournament.startDate);
    start.setHours(0, 0, 0, 0);
    if (start > today) {
      return res.status(400).json({
        error: `Registration opens on ${start.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`,
      });
    }
  }

  // Capacity is checked against the real registered rows, never the cached column.
  const registered = await countParticipants(id);
  if (registered >= tournament.maxParticipants)
    return res.status(400).json({ error: "Tournament is full" });

  // Find or create the player record for this Discord session user
  let [player] = await db
    .select()
    .from(playersTable)
    .where(eq(playersTable.id, req.session.userId));

  if (!player) {
    const [created] = await db
      .insert(playersTable)
      .values({
        username: req.session.username ?? `user_${req.session.userId}`,
        displayName: req.session.displayName ?? null,
        avatarUrl: req.session.avatarUrl ?? null,
        discordId: req.session.discordId ?? null,
        role: "player",
      })
      .returning();
    player = created;
  }

  // Check already registered
  const [existing] = await db
    .select()
    .from(tournamentParticipantsTable)
    .where(
      and(
        eq(tournamentParticipantsTable.tournamentId, id),
        eq(tournamentParticipantsTable.playerId, player.id)
      )
    );
  if (existing) return res.status(409).json({ error: "Already registered" });

  const [participant] = await db
    .insert(tournamentParticipantsTable)
    .values({ tournamentId: id, type: "player", playerId: player.id, teamId: null })
    .returning();

  const newCount = await syncParticipantCount(id);

  return res.status(201).json({
    ...participant,
    playerName: player.username,
    displayName: player.displayName,
    avatarUrl: player.avatarUrl,
    currentParticipants: newCount,
  });
});

router.post("/tournaments/:id/register", async (req, res) => {
  const params = RegisterForTournamentParams.safeParse(req.params);
  if (!params.success) return res.status(400).json({ error: "Invalid params" });

  const body = RegisterForTournamentBody.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Invalid body" });

  const [tournament] = await db
    .select()
    .from(tournamentsTable)
    .where(eq(tournamentsTable.id, params.data.id));

  if (!tournament) return res.status(404).json({ error: "Tournament not found" });

  const [participant] = await db
    .insert(tournamentParticipantsTable)
    .values({
      tournamentId: params.data.id,
      type: body.data.type,
      playerId: body.data.playerId ?? null,
      teamId: body.data.teamId ?? null,
    })
    .returning();

  const newCount = await syncParticipantCount(params.data.id);

  let playerName: string | null = null;
  let teamName: string | null = null;
  if (body.data.playerId) {
    const [p] = await db
      .select({ username: playersTable.username })
      .from(playersTable)
      .where(eq(playersTable.id, body.data.playerId));
    playerName = p?.username ?? null;
  }
  if (body.data.teamId) {
    const [t] = await db
      .select({ name: teamsTable.name })
      .from(teamsTable)
      .where(eq(teamsTable.id, body.data.teamId));
    teamName = t?.name ?? null;
  }

  return res.status(201).json({
    ...participant,
    playerName,
    teamName,
    seed: null,
    currentParticipants: newCount,
  });
});

router.get("/tournaments/:id/bracket", async (req, res) => {
  const params = GetTournamentBracketParams.safeParse(req.params);
  if (!params.success) return res.status(400).json({ error: "Invalid params" });

  const matches = await db
    .select()
    .from(matchesTable)
    .where(eq(matchesTable.tournamentId, params.data.id))
    .orderBy(matchesTable.round);

  const roundMap = new Map<number, typeof matches>();
  for (const m of matches) {
    if (!roundMap.has(m.round)) roundMap.set(m.round, []);
    roundMap.get(m.round)!.push(m);
  }

  const rounds = Array.from(roundMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([roundNumber, ms]) => ({
      roundNumber,
      name: ms[0]?.roundName ?? `Round ${roundNumber}`,
      matches: ms.map((m) => ({
        ...m,
        tournamentName: null,
        createdAt: m.createdAt.toISOString(),
        parentMatch1Id: m.parentMatch1Id,
        parentMatch2Id: m.parentMatch2Id,
        nextMatchId: m.nextMatchId,
        nextSlot: m.nextSlot,
        stage: m.stage,
      })),
    }));

  return res.json({ tournamentId: params.data.id, rounds });
});

router.get("/tournaments/:id/matches", async (req, res) => {
  const params = GetTournamentMatchesParams.safeParse(req.params);
  if (!params.success) return res.status(400).json({ error: "Invalid params" });

  const [tournament] = await db
    .select({ name: tournamentsTable.name })
    .from(tournamentsTable)
    .where(eq(tournamentsTable.id, params.data.id));

  const matches = await db
    .select()
    .from(matchesTable)
    .where(eq(matchesTable.tournamentId, params.data.id))
    .orderBy(matchesTable.round);

  return res.json(
    matches.map((m) => ({
      ...m,
      tournamentName: tournament?.name ?? null,
      createdAt: m.createdAt.toISOString(),
    }))
  );
});

// Public participants endpoint — returns team/player info including logos
router.get("/tournaments/:id/participants", async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

  const rows = await db
    .select({
      id: tournamentParticipantsTable.id,
      playerId: tournamentParticipantsTable.playerId,
      teamId: tournamentParticipantsTable.teamId,
      seed: tournamentParticipantsTable.seed,
      username: playersTable.username,
      displayName: playersTable.displayName,
      avatarUrl: playersTable.avatarUrl,
      teamName: teamsTable.name,
      teamLogoUrl: teamsTable.logoUrl,
    })
    .from(tournamentParticipantsTable)
    .leftJoin(playersTable, eq(tournamentParticipantsTable.playerId, playersTable.id))
    .leftJoin(teamsTable, eq(tournamentParticipantsTable.teamId, teamsTable.id))
    .where(eq(tournamentParticipantsTable.tournamentId, id))
    .orderBy(tournamentParticipantsTable.id);

  // For team participants attach the clan's roster (the players on that team).
  const teamIds = [...new Set(rows.map((r) => r.teamId).filter((x): x is number => x != null))];
  const membersByTeam = new Map<number, Array<{
    id: number;
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
    role: string;
  }>>();
  if (teamIds.length > 0) {
    const members = await db
      .select({
        teamId: playersTable.teamId,
        id: playersTable.id,
        username: playersTable.username,
        displayName: playersTable.displayName,
        avatarUrl: playersTable.avatarUrl,
        role: playersTable.role,
      })
      .from(playersTable)
      .where(inArray(playersTable.teamId, teamIds))
      .orderBy(playersTable.id);
    for (const m of members) {
      if (m.teamId == null) continue;
      const list = membersByTeam.get(m.teamId) ?? [];
      list.push({ id: m.id, username: m.username, displayName: m.displayName, avatarUrl: m.avatarUrl, role: m.role });
      membersByTeam.set(m.teamId, list);
    }
  }

  return res.json(
    rows.map((r) => ({
      id: r.id,
      playerId: r.playerId,
      teamId: r.teamId,
      seed: r.seed,
      username: r.username,
      displayName: r.displayName,
      avatarUrl: r.avatarUrl,
      teamName: r.teamName,
      teamLogoUrl: r.teamLogoUrl,
      members: r.teamId != null ? (membersByTeam.get(r.teamId) ?? []) : [],
    })),
  );
});

// Public tournament stats — calculated from match results scoped to this tournament
router.get("/tournaments/:id/stats", async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

  const matches = await db
    .select()
    .from(matchesTable)
    .where(eq(matchesTable.tournamentId, id));

  interface PlayerStat {
    playerId: number;
    name: string;
    matches: number;
    wins: number;
    losses: number;
    draws: number;
    goalsFor: number;
    goalsAgainst: number;
    points: number;
  }

  const stats = new Map<number, PlayerStat>();

  function ensure(pid: number, name: string) {
    if (!stats.has(pid)) {
      stats.set(pid, { playerId: pid, name, matches: 0, wins: 0, losses: 0, draws: 0, goalsFor: 0, goalsAgainst: 0, points: 0 });
    }
    return stats.get(pid)!;
  }

  for (const m of matches) {
    const p1id = m.participant1Id ?? 0;
    const p2id = m.participant2Id ?? 0;
    if (!p1id || !p2id) continue;

    const p1name = m.participant1Name ?? `Player ${p1id}`;
    const p2name = m.participant2Name ?? `Player ${p2id}`;

    ensure(p1id, p1name);
    ensure(p2id, p2name);

    if (m.status !== "completed") continue;

    const p1 = ensure(p1id, p1name);
    const p2 = ensure(p2id, p2name);
    const s1 = m.participant1Score ?? 0;
    const s2 = m.participant2Score ?? 0;

    p1.matches++; p2.matches++;
    p1.goalsFor += s1; p1.goalsAgainst += s2;
    p2.goalsFor += s2; p2.goalsAgainst += s1;

    if (m.winnerId === p1id) {
      p1.wins++; p1.points += 3; p2.losses++;
    } else if (m.winnerId === p2id) {
      p2.wins++; p2.points += 3; p1.losses++;
    } else {
      p1.draws++; p1.points += 1;
      p2.draws++; p2.points += 1;
    }
  }

  const result = Array.from(stats.values()).sort(
    (a, b) => b.points - a.points || b.wins - a.wins || b.goalsFor - a.goalsFor || a.name.localeCompare(b.name)
  );

  return res.json(result);
});

/**
 * Origin (scheme + host, no trailing slash) of the SPA, used for Stripe's
 * success/cancel URLs. Prefers the values this deployment already documents
 * (`FRONTEND_ORIGINS`, then `BASE_URL`) and falls back to the request origin.
 */
function resolveFrontendOrigin(req: import("express").Request): string {
  const configured = (process.env["FRONTEND_ORIGINS"] ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)[0];

  for (const candidate of [configured, process.env["BASE_URL"]]) {
    if (!candidate) continue;
    try {
      return new URL(candidate).origin;
    } catch {
      // Malformed value — try the next source instead of failing the request.
    }
  }

  const proto = (req.headers["x-forwarded-proto"] as string | undefined)?.split(",")[0]?.trim() ?? req.protocol;
  const host = (req.headers["x-forwarded-host"] as string | undefined)?.split(",")[0]?.trim() ?? req.get("host");
  return host ? `${proto}://${host}` : "";
}

/**
 * Resolve the caller's clan for a clan-tournament registration, enforcing the
 * President/Coach rule from the DB. Returns null (after answering) on any refusal.
 */
async function resolveRegisteringTeam(
  req: import("express").Request,
  res: import("express").Response,
  tournament: typeof tournamentsTable.$inferSelect,
): Promise<{ team: typeof teamsTable.$inferSelect; player: typeof playersTable.$inferSelect } | null> {
  if (tournament.status === "completed" || tournament.status === "cancelled") {
    res.status(400).json({ error: "Tournament is no longer open for registration" });
    return null;
  }

  const registered = await countParticipants(tournament.id);
  if (registered >= tournament.maxParticipants) {
    res.status(400).json({ error: "Tournament is full" });
    return null;
  }

  const uid = req.session?.userId;
  if (uid == null) {
    res.status(401).json({ error: "Login with Discord first" });
    return null;
  }

  const [player] = await db.select().from(playersTable).where(eq(playersTable.id, uid));
  if (!player) {
    res.status(400).json({ error: "Player profile not found" });
    return null;
  }
  if (!player.teamId) {
    res.status(403).json({ error: "You are not on a team — only a team President or Coach can register their team" });
    return null;
  }

  const [team] = await db.select().from(teamsTable).where(eq(teamsTable.id, player.teamId));
  if (!team) {
    res.status(400).json({ error: "Team not found" });
    return null;
  }

  const isPresident = team.presidentId === player.id;
  const isCoach = (team as { coachId?: number | null }).coachId === player.id;
  if (!isPresident && !isCoach) {
    res.status(403).json({ error: "Only the team President or Coach can register the team" });
    return null;
  }

  return { team, player };
}

// ── POST /tournaments/:id/register-team/stripe ───────────────────────────────
// Card path for a paid clan tournament. Creates (or reuses) the clan's unpaid
// registration and returns a hosted Stripe Checkout URL. The clan is registered
// by the `checkout.session.completed` webhook — never by the browser — so a
// cancelled or unpaid checkout changes nothing.
router.post("/tournaments/:id/register-team/stripe", async (req, res) => {
  const id = Number(req.params.id);
  if (!req.session?.userId) return res.status(401).json({ error: "Login with Discord first" });

  const [tournament] = await db.select().from(tournamentsTable).where(eq(tournamentsTable.id, id));
  if (!tournament) return res.status(404).json({ error: "Tournament not found" });
  if (!tournament.isClanTournament) return res.status(400).json({ error: "This is not a clan tournament" });
  if (tournament.registrationFeeCents <= 0) {
    return res.status(400).json({ error: "This tournament has no entry fee — register your clan for free" });
  }
  if (!isStripeConfigured()) return res.status(503).json({ error: "Card payments are not configured yet" });

  const ctx = await resolveRegisteringTeam(req, res, tournament);
  if (!ctx) return;

  const [already] = await db
    .select({ id: tournamentParticipantsTable.id })
    .from(tournamentParticipantsTable)
    .where(
      and(
        eq(tournamentParticipantsTable.tournamentId, id),
        eq(tournamentParticipantsTable.teamId, ctx.team.id),
      ),
    );
  if (already) return res.status(409).json({ error: "Your team is already registered" });

  // Reuse an existing unpaid registration instead of creating a second one, so
  // retrying the checkout can never produce two entry fees.
  const [existing] = await db
    .select()
    .from(clanRegistrationsTable)
    .where(
      and(
        eq(clanRegistrationsTable.tournamentId, id),
        eq(clanRegistrationsTable.teamId, ctx.team.id),
        eq(clanRegistrationsTable.method, "stripe"),
        sql`${clanRegistrationsTable.status} <> 'approved'`,
      ),
    )
    .limit(1);

  const registration =
    existing ??
    (
      await db
        .insert(clanRegistrationsTable)
        .values({
          tournamentId: id,
          teamId: ctx.team.id,
          requestedById: ctx.player.id,
          method: "stripe",
          status: "awaiting_payment",
          feeCents: tournament.registrationFeeCents,
        })
        .returning()
    )[0];

  const origin = resolveFrontendOrigin(req);

  try {
    const session = await getStripe().checkout.sessions.create({
      mode: "payment",
      client_reference_id: String(ctx.player.id),
      // `kind` is what routes the webhook to the clan-registration fulfilment
      // instead of the coin top-up path.
      metadata: {
        kind: CLAN_REGISTRATION_KIND,
        registrationId: String(registration.id),
        tournamentId: String(id),
        teamId: String(ctx.team.id),
        userId: String(ctx.player.id),
      },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: tournament.registrationFeeCents,
            product_data: {
              name: `${tournament.name} — clan entry fee`,
              description: `Entry fee for ${ctx.team.name}`,
            },
          },
        },
      ],
      success_url: `${origin}/tournament/${id}?registration=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/tournament/${id}?registration=cancelled`,
    });

    if (!session.url) {
      return res.status(502).json({ error: "Stripe did not return a checkout URL" });
    }

    await db
      .update(clanRegistrationsTable)
      .set({ stripeSessionId: session.id })
      .where(eq(clanRegistrationsTable.id, registration.id));

    return res.json({
      url: session.url,
      sessionId: session.id,
      registrationId: registration.id,
      feeCents: tournament.registrationFeeCents,
    });
  } catch (err) {
    console.error("[clan-registration] could not create the checkout session", err);
    return res.status(502).json({ error: "Could not start the card payment. Please try again." });
  }
});

// ── POST /tournaments/:id/register-team/evc ──────────────────────────────────
// EVC Plus path. EVC Plus has no API, so this only creates (or reuses) the clan's
// unpaid registration and hands back the number + amount to send.
router.post("/tournaments/:id/register-team/evc", async (req, res) => {
  const id = Number(req.params.id);
  if (!req.session?.userId) return res.status(401).json({ error: "Login with Discord first" });

  const [tournament] = await db.select().from(tournamentsTable).where(eq(tournamentsTable.id, id));
  if (!tournament) return res.status(404).json({ error: "Tournament not found" });
  if (!tournament.isClanTournament) return res.status(400).json({ error: "This is not a clan tournament" });
  if (tournament.registrationFeeCents <= 0) return res.status(400).json({ error: "This tournament has no entry fee" });
  if (!tournament.evcPlusNumber) return res.status(503).json({ error: "EVC Plus is not configured for this tournament" });

  const ctx = await resolveRegisteringTeam(req, res, tournament);
  if (!ctx) return;

  const [already] = await db
    .select({ id: tournamentParticipantsTable.id })
    .from(tournamentParticipantsTable)
    .where(
      and(
        eq(tournamentParticipantsTable.tournamentId, id),
        eq(tournamentParticipantsTable.teamId, ctx.team.id),
      ),
    );
  if (already) return res.status(409).json({ error: "Your team is already registered" });

  const [existing] = await db
    .select()
    .from(clanRegistrationsTable)
    .where(
      and(
        eq(clanRegistrationsTable.tournamentId, id),
        eq(clanRegistrationsTable.teamId, ctx.team.id),
        eq(clanRegistrationsTable.method, "evcplus"),
        sql`${clanRegistrationsTable.status} IN ('awaiting_payment','pending_review')`,
      ),
    )
    .limit(1);

  const registration =
    existing ??
    (
      await db
        .insert(clanRegistrationsTable)
        .values({
          tournamentId: id,
          teamId: ctx.team.id,
          requestedById: ctx.player.id,
          method: "evcplus",
          status: "awaiting_payment",
          feeCents: tournament.registrationFeeCents,
        })
        .returning()
    )[0];

  return res.json({
    registrationId: registration.id,
    status: registration.status,
    feeCents: tournament.registrationFeeCents,
    evcPlusNumber: tournament.evcPlusNumber,
    evcPlusAccountName: tournament.evcPlusAccountName,
    evcPlusAmountText: tournament.evcPlusAmountText,
  });
});

// ── POST /tournaments/:id/register-team/evc/sent ─────────────────────────────
// "I sent the money": the clan reports the transfer. The registration moves to
// `pending_review` and NO participant row is created — an admin must approve it
// (POST /admin/clan-registrations/:id/approve), which registers the clan and
// writes the audit-log entry.
router.post("/tournaments/:id/register-team/evc/sent", async (req, res) => {
  const id = Number(req.params.id);
  if (!req.session?.userId) return res.status(401).json({ error: "Login with Discord first" });

  const [tournament] = await db.select().from(tournamentsTable).where(eq(tournamentsTable.id, id));
  if (!tournament) return res.status(404).json({ error: "Tournament not found" });
  if (!tournament.isClanTournament) return res.status(400).json({ error: "This is not a clan tournament" });

  const ctx = await resolveRegisteringTeam(req, res, tournament);
  if (!ctx) return;

  const rawNote = (req.body as { note?: unknown } | null)?.note;
  const note = typeof rawNote === "string" ? rawNote.trim().slice(0, 300) : null;

  const [registration] = await db
    .select()
    .from(clanRegistrationsTable)
    .where(
      and(
        eq(clanRegistrationsTable.tournamentId, id),
        eq(clanRegistrationsTable.teamId, ctx.team.id),
        eq(clanRegistrationsTable.method, "evcplus"),
        sql`${clanRegistrationsTable.status} <> 'approved'`,
      ),
    )
    .orderBy(desc(clanRegistrationsTable.id))
    .limit(1);

  if (!registration) return res.status(404).json({ error: "Start the EVC Plus registration first" });
  if (registration.status === "pending_review") {
    return res.json({ ok: true, status: "pending_review", alreadySubmitted: true });
  }
  if (registration.status === "rejected") {
    return res.status(409).json({ error: "This registration was rejected — contact a tournament admin" });
  }

  await db
    .update(clanRegistrationsTable)
    .set({ status: "pending_review", payerNote: note })
    .where(eq(clanRegistrationsTable.id, registration.id));

  return res.json({ ok: true, status: "pending_review" });
});

// ── GET /tournaments/:id/registration-status ─────────────────────────────────
// The caller's clan state for one tournament: whether the clan is registered, and
// the latest fee registration (used after the Stripe redirect and to render the
// "waiting for admin approval" banner).
router.get("/tournaments/:id/registration-status", async (req, res) => {
  const id = Number(req.params.id);
  const me = req.session?.userId;
  if (!me) return res.status(401).json({ error: "Login with Discord first" });

  const [player] = await db
    .select({ teamId: playersTable.teamId })
    .from(playersTable)
    .where(eq(playersTable.id, me));
  if (!player?.teamId) return res.json({ registered: false, teamId: null, registration: null });

  const [participant] = await db
    .select({ id: tournamentParticipantsTable.id })
    .from(tournamentParticipantsTable)
    .where(
      and(
        eq(tournamentParticipantsTable.tournamentId, id),
        eq(tournamentParticipantsTable.teamId, player.teamId),
      ),
    );

  const [registration] = await db
    .select()
    .from(clanRegistrationsTable)
    .where(
      and(
        eq(clanRegistrationsTable.tournamentId, id),
        eq(clanRegistrationsTable.teamId, player.teamId),
      ),
    )
    .orderBy(desc(clanRegistrationsTable.id))
    .limit(1);

  return res.json({
    registered: Boolean(participant),
    teamId: player.teamId,
    registration: registration
      ? {
          ...registration,
          createdAt: registration.createdAt.toISOString(),
          reviewedAt: registration.reviewedAt?.toISOString() ?? null,
        }
      : null,
  });
});

export default router;
