import { Router } from "express";
import { db } from "@workspace/db";
import {
  tournamentsTable,
  tournamentParticipantsTable,
  matchesTable,
  playersTable,
  teamsTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";
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
    .orderBy(tournamentsTable.startDate);

  return res.json(tournaments.map((t) => ({ ...t, createdAt: t.createdAt.toISOString() })));
});

router.post("/tournaments", async (req, res) => {
  const body = CreateTournamentBody.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Invalid body" });

  const [tournament] = await db.insert(tournamentsTable).values(body.data).returning();
  return res.status(201).json({ ...tournament, createdAt: tournament.createdAt.toISOString() });
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

  const roundNames: Record<number, string> = {
    1: "Round of 16",
    2: "Quarterfinals",
    3: "Semifinals",
    4: "Final",
  };

  const rounds = Array.from(roundMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([roundNumber, ms]) => ({
      roundNumber,
      name: roundNames[roundNumber] ?? `Round ${roundNumber}`,
      matches: ms.map((m) => ({ ...m, tournamentName: null, createdAt: m.createdAt.toISOString() })),
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

export default router;
