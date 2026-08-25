import { Router } from "express";
import { db } from "@workspace/db";
import {
  tournamentsTable,
  tournamentParticipantsTable,
  matchesTable,
  playersTable,
  teamsTable,
  tournamentAdminsTable,
} from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import {
  ListTournamentsQueryParams,
  CreateTournamentBody,
  GetTournamentParams,
  RegisterForTournamentParams,
  RegisterForTournamentBody,
  GetTournamentBracketParams,
  GetTournamentMatchesParams,
} from "@workspace/api-zod";

const router = Router();

router.get("/tournaments", async (req, res) => {
  const query = ListTournamentsQueryParams.safeParse(req.query);
  if (!query.success) return res.status(400).json({ error: "Invalid query" });

  const { status } = query.data;
  const tournaments = await db
    .select()
    .from(tournamentsTable)
    .where(status ? eq(tournamentsTable.status, status) : undefined)
    .orderBy(sql`COALESCE(${tournamentsTable.startDate}, '9999-12-31')`, tournamentsTable.createdAt);

  return res.json(tournaments.map((t) => ({ ...t, createdAt: t.createdAt.toISOString() })));
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

  const [tournament] = await db.insert(tournamentsTable).values({
    ...body.data,
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
  return res.json({ ...tournament, createdAt: tournament.createdAt.toISOString() });
});

/**
 * GET /tournaments/:id/my-registration
 * Returns whether the currently-logged-in Discord user is already registered.
 */
router.get("/tournaments/:id/my-registration", async (req, res) => {
  const id = Number(req.params.id);
  if (!req.session?.userId) return res.json({ registered: false });

  const [player] = await db
    .select({ id: playersTable.id })
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

  return res.json({ registered: !!existing });
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

  if (tournament.currentParticipants >= tournament.maxParticipants)
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

  await db
    .update(tournamentsTable)
    .set({ currentParticipants: tournament.currentParticipants + 1 })
    .where(eq(tournamentsTable.id, id));

  return res.status(201).json({
    ...participant,
    playerName: player.username,
    displayName: player.displayName,
    avatarUrl: player.avatarUrl,
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

  await db
    .update(tournamentsTable)
    .set({ currentParticipants: tournament.currentParticipants + 1 })
    .where(eq(tournamentsTable.id, params.data.id));

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

  return res.json(rows);
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

export default router;
