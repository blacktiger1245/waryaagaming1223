import { Router } from "express";
import { db } from "@workspace/db";
import { playersTable, teamsTable, matchesTable, matchPlayerGamesTable } from "@workspace/db";
import { tournamentsTable } from "@workspace/db";
import { eq, ilike, desc, sql, or, and } from "drizzle-orm";
import {
  ListPlayersQueryParams,
  CreatePlayerBody,
  UpdatePlayerParams,
  UpdatePlayerBody,
  GetPlayerParams,
  GetPlayerMatchHistoryParams,
} from "@workspace/api-zod";

const router = Router();

// Counts a player's real match wins (solo tournament matches + team-tournament
// individual games), mirroring the player profile's live "Wins" stat so the
// Players list matches what you see on a player's profile.
async function countPlayerWins(playerId: number): Promise<number> {
  let wins = 0;

  const matches = await db
    .select({
      p1: matchesTable.participant1Id,
      p2: matchesTable.participant2Id,
      s1: matchesTable.participant1Score,
      s2: matchesTable.participant2Score,
    })
    .from(matchesTable)
    .where(
      and(
        eq(matchesTable.status, "completed"),
        or(eq(matchesTable.participant1Id, playerId), eq(matchesTable.participant2Id, playerId)),
      ),
    );
  for (const m of matches) {
    const isP1 = m.p1 === playerId;
    const my = isP1 ? m.s1 : m.s2;
    const opp = isP1 ? m.s2 : m.s1;
    if ((my ?? 0) > (opp ?? 0)) wins++;
  }

  const games = await db
    .select({
      h: matchPlayerGamesTable.homePlayerId,
      a: matchPlayerGamesTable.awayPlayerId,
      hs: matchPlayerGamesTable.homeScore,
      as: matchPlayerGamesTable.awayScore,
    })
    .from(matchPlayerGamesTable)
    .where(
      and(
        eq(matchPlayerGamesTable.status, "completed"),
        or(
          eq(matchPlayerGamesTable.homePlayerId, playerId),
          eq(matchPlayerGamesTable.awayPlayerId, playerId),
        ),
      ),
    );
  for (const g of games) {
    const isHome = g.h === playerId;
    const my = isHome ? g.hs : g.as;
    const opp = isHome ? g.as : g.hs;
    if ((my ?? 0) > (opp ?? 0)) wins++;
  }

  return wins;
}

router.get("/players", async (req, res) => {
  const query = ListPlayersQueryParams.safeParse(req.query);
  if (!query.success) return res.status(400).json({ error: "Invalid query" });

  const { search, limit = 50, offset = 0 } = query.data;

  // When searching, fetch all matching players ordered by points so we can
  // assign each one a global rank (their position among ALL players by points).
  // Without a search filter we can use offset directly.
  const players = await db
    .select()
    .from(playersTable)
    .where(search ? ilike(playersTable.username, `%${search}%`) : undefined)
    .limit(limit)
    .offset(offset)
    .orderBy(desc(playersTable.points));

  // For each player compute their true rank: how many players have strictly more points
  const teams = await db.select({ id: teamsTable.id, name: teamsTable.name, logoUrl: teamsTable.logoUrl }).from(teamsTable);
  const teamMap = new Map(teams.map((t) => [t.id, t.name]));
  const teamLogoMap = new Map(teams.map((t) => [t.id, t.logoUrl]));

  // Resolve global rank for each returned player in parallel
  const withRanks = await Promise.all(
    players.map(async (p) => {
      const [{ above }] = await db
        .select({ above: sql<number>`count(*)` })
        .from(playersTable)
        .where(sql`${playersTable.points} > ${p.points}`);
      return {
        ...p,
        rank: Number(above) + 1,
        wins: await countPlayerWins(p.id),
        teamName: p.teamId ? (teamMap.get(p.teamId) ?? null) : null,
        teamLogoUrl: p.teamId ? (teamLogoMap.get(p.teamId) ?? null) : null,
        createdAt: p.createdAt.toISOString(),
      };
    })
  );

  return res.json(withRanks);
});

// Referees: every user granted the 'referee' role, read directly from their
// account so the list always stays in sync with the assigned role and their
// existing profile/stats (no duplicated referee records).
router.get("/players/referees", async (_req, res) => {
  const rows = await db
    .select({
      id: playersTable.id,
      username: playersTable.username,
      displayName: playersTable.displayName,
      avatarUrl: playersTable.avatarUrl,
      role: playersTable.role,
      country: playersTable.country,
      matchesPlayed: playersTable.matchesPlayed,
      matchesWon: playersTable.matchesWon,
      rating: playersTable.rating,
      verified: playersTable.verified,
      points: playersTable.points,
    })
    .from(playersTable)
    .where(sql`${playersTable.role} = 'referee' AND ${playersTable.isActive} = true`)
    .orderBy(desc(playersTable.points), desc(playersTable.rating));
  return res.json(rows);
});

// Marketplace listings are intentionally limited to opted-in, unrostered players.
router.get("/players/marketplace", async (_req, res) => {
  let players = await db
    .select()
    .from(playersTable)
    .where(sql`${playersTable.isFreeAgent} = true AND ${playersTable.teamId} IS NULL AND ${playersTable.isActive} = true`)
    .orderBy(desc(playersTable.points));

  if (players.length === 0) {
    players = [{
      id: 999999,
      username: "fake-agent-01",
      displayName: "Aiden Cole",
      avatarUrl: null,
      email: null,
      teamId: null,
      rank: 1,
      previousRank: 0,
      tournamentWins: 0,
      winRate: 0,
      matchesPlayed: 0,
      matchesWon: 0,
      matchesLost: 0,
      lossRate: 0,
      points: 0,
      country: "US",
      discordId: null,
      bio: "Available for trial and club-level offers.",
      cleanSheets: 0,
      rating: 88,
      marketValue: 5,
      goalsScored: 0,
      draws: 0,
      goalsConceded: 0,
      manOfTheMatch: 0,
      yellowCards: 0,
      redCards: 0,
      gamingDevice: "pc",
      deviceName: "Waryaa Pro Setup",
      konamiId: null,
      bloodGroup: null,
      profileComplete: true,
      isFreeAgent: true,
      isActive: true,
      badges: [],
      role: "player",
      bannedUntil: null,
      banReason: null,
      bannedBy: null,
      createdAt: new Date(),
    } as any];
  }

  return res.json(players.map((p) => ({ ...p, createdAt: p.createdAt.toISOString() })));
});

router.post("/players", async (req, res) => {
  const body = CreatePlayerBody.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Invalid body" });

  const count = await db.select({ count: sql<number>`count(*)` }).from(playersTable);
  const rank = Number(count[0]?.count ?? 0) + 1;

  const [player] = await db
    .insert(playersTable)
    .values({ ...body.data, rank })
    .returning();

  return res.status(201).json({ ...player, teamName: null, createdAt: player.createdAt.toISOString() });
});

router.get("/players/:id", async (req, res) => {
  const params = GetPlayerParams.safeParse(req.params);
  if (!params.success) return res.status(400).json({ error: "Invalid params" });

  const [player] = await db.select().from(playersTable).where(eq(playersTable.id, params.data.id));
  if (!player) return res.status(404).json({ error: "Player not found" });

  let teamName: string | null = null;
  let teamLogoUrl: string | null = null;
  let teamTag: string | null = null;
  let teamCaptainId: number | null = null;
  if (player.teamId) {
    const [team] = await db
      .select({ name: teamsTable.name, logoUrl: teamsTable.logoUrl, tag: teamsTable.tag, captainId: teamsTable.captainId })
      .from(teamsTable)
      .where(eq(teamsTable.id, player.teamId));
    teamName = team?.name ?? null;
    teamLogoUrl = team?.logoUrl ?? null;
    teamTag = team?.tag ?? null;
    teamCaptainId = team?.captainId ?? null;
  }

  // Compute rank dynamically: how many players have strictly more points
  const [{ above }] = await db
    .select({ above: sql<number>`count(*)` })
    .from(playersTable)
    .where(sql`${playersTable.points} > ${player.points}`);
  const dynamicRank = Number(above) + 1;
  const wins = await countPlayerWins(player.id);

  return res.json({ ...player, rank: dynamicRank, wins, teamName, teamLogoUrl, teamTag, teamCaptainId, createdAt: player.createdAt.toISOString() });
});

router.patch("/players/:id", async (req, res) => {
  const params = UpdatePlayerParams.safeParse(req.params);
  if (!params.success) return res.status(400).json({ error: "Invalid params" });

  const body = UpdatePlayerBody.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Invalid body" });

  const [player] = await db
    .update(playersTable)
    .set(body.data)
    .where(eq(playersTable.id, params.data.id))
    .returning();

  if (!player) return res.status(404).json({ error: "Player not found" });
  return res.json({ ...player, teamName: null, createdAt: player.createdAt.toISOString() });
});

router.get("/players/:id/match-history", async (req, res) => {
  const params = GetPlayerMatchHistoryParams.safeParse(req.params);
  if (!params.success) return res.status(400).json({ error: "Invalid params" });

  const [player] = await db.select().from(playersTable).where(eq(playersTable.id, params.data.id));
  if (!player) return res.status(404).json({ error: "Player not found" });

  // Only return solo-tournament matches where this specific player was a direct participant.
  // Team-tournament matches use team IDs in participant columns, not player IDs — those are
  // handled separately via /players/:id/player-games.
  const matches = await db
    .select({
      id: matchesTable.id,
      tournamentId: matchesTable.tournamentId,
      tournamentName: tournamentsTable.name,
      round: matchesTable.round,
      roundName: matchesTable.roundName,
      status: matchesTable.status,
      participant1Id: matchesTable.participant1Id,
      participant1Name: matchesTable.participant1Name,
      participant1Score: matchesTable.participant1Score,
      participant2Id: matchesTable.participant2Id,
      participant2Name: matchesTable.participant2Name,
      participant2Score: matchesTable.participant2Score,
      winnerId: matchesTable.winnerId,
      winnerName: matchesTable.winnerName,
      scheduledAt: matchesTable.scheduledAt,
      manOfTheMatchId: matchesTable.manOfTheMatchId,
      manOfTheMatchName: matchesTable.manOfTheMatchName,
      createdAt: matchesTable.createdAt,
    })
    .from(matchesTable)
    .leftJoin(tournamentsTable, eq(matchesTable.tournamentId, tournamentsTable.id))
    .where(
      sql`(${matchesTable.participant1Id} = ${params.data.id} OR ${matchesTable.participant2Id} = ${params.data.id})
          AND ${tournamentsTable.tournamentType} = 'solo'`
    )
    .orderBy(desc(matchesTable.createdAt))
    .limit(50);

  return res.json(
    matches.map((m) => ({
      ...m,
      createdAt: m.createdAt.toISOString(),
    }))
  );
});

// Individual player games inside team-tournament matches
router.get("/players/:id/player-games", async (req, res) => {
  const params = GetPlayerMatchHistoryParams.safeParse(req.params);
  if (!params.success) return res.status(400).json({ error: "Invalid params" });

  const [player] = await db.select().from(playersTable).where(eq(playersTable.id, params.data.id));
  if (!player) return res.status(404).json({ error: "Player not found" });

  const games = await db
    .select({
      id: matchPlayerGamesTable.id,
      matchId: matchPlayerGamesTable.matchId,
      homePlayerId: matchPlayerGamesTable.homePlayerId,
      homePlayerName: matchPlayerGamesTable.homePlayerName,
      awayPlayerId: matchPlayerGamesTable.awayPlayerId,
      awayPlayerName: matchPlayerGamesTable.awayPlayerName,
      homeScore: matchPlayerGamesTable.homeScore,
      awayScore: matchPlayerGamesTable.awayScore,
      status: matchPlayerGamesTable.status,
      // match context
      round: matchesTable.round,
      roundName: matchesTable.roundName,
      matchStatus: matchesTable.status,
      manOfTheMatchId: matchesTable.manOfTheMatchId,
      // tournament context
      tournamentId: tournamentsTable.id,
      tournamentName: tournamentsTable.name,
    })
    .from(matchPlayerGamesTable)
    .leftJoin(matchesTable, eq(matchPlayerGamesTable.matchId, matchesTable.id))
    .leftJoin(tournamentsTable, eq(matchesTable.tournamentId, tournamentsTable.id))
    .where(
      or(
        eq(matchPlayerGamesTable.homePlayerId, params.data.id),
        eq(matchPlayerGamesTable.awayPlayerId, params.data.id)
      )
    )
    .orderBy(desc(matchesTable.createdAt))
    .limit(100);

  return res.json(games);
});

// ── Coach profile stats ──────────────────────────────────────────────────────
// Returns whether this player is a coach (teams.coach_id) and, if so, computes
// the coach's card stats from the coached team's completed team-tournament
// matches (they are calculated live whenever the team's matches change).
router.get("/players/:id/coach-stats", async (req, res) => {
  const coachId = Number(req.params.id);
  if (!Number.isInteger(coachId)) return res.status(400).json({ error: "Invalid id" });
  try {
    const [team] = await db
      .select()
      .from(teamsTable)
      .where(eq(teamsTable.coachId, coachId))
      .limit(1);
    if (!team) return res.json({ isCoach: false, team: null });

    const matches = await db
      .select({
        id: matchesTable.id,
        tournamentId: matchesTable.tournamentId,
        participant1Id: matchesTable.participant1Id,
        participant2Id: matchesTable.participant2Id,
        participant1Score: matchesTable.participant1Score,
        participant2Score: matchesTable.participant2Score,
        winnerId: matchesTable.winnerId,
      })
      .from(matchesTable)
      .innerJoin(tournamentsTable, eq(tournamentsTable.id, matchesTable.tournamentId))
      .where(
        sql`(${matchesTable.participant1Id} = ${team.id} OR ${matchesTable.participant2Id} = ${team.id})
            AND ${matchesTable.status} = 'completed'
            AND ${tournamentsTable.tournamentType} = 'team'`,
      );

    let games = 0;
    let wins = 0;
    let draws = 0;
    let losses = 0;
    const latest = new Map<number, { maxId: number; teamWon: boolean }>();

    for (const m of matches) {
      games++;
      const my = m.participant1Id === team.id ? (m.participant1Score ?? 0) : (m.participant2Score ?? 0);
      const opp = m.participant1Id === team.id ? (m.participant2Score ?? 0) : (m.participant1Score ?? 0);
      let won = false;
      if (my > opp) { wins++; won = true; }
      else if (my === opp) draws++;
      else losses++;

      const cur = latest.get(m.tournamentId);
      if (!cur || m.id > cur.maxId) latest.set(m.tournamentId, { maxId: m.id, teamWon: won });
    }

    const tournamentWins = [...latest.values()].filter((v) => v.teamWon).length;
    const points = team.points ?? 0;
    const unbeaten = wins + draws;

    return res.json({
      isCoach: true,
      team: { id: team.id, name: team.name, tag: team.tag, logoUrl: team.logoUrl },
      games,
      wins,
      draws,
      losses,
      unbeaten,
      points,
      tournamentWins,
      winRate: games > 0 ? Math.round((wins / games) * 100) : 0,
    });
  } catch (error: unknown) {
    req.log.error({ err: error }, "Error computing coach stats");
    return res.json({ isCoach: false, team: null });
  }
});

export default router;
