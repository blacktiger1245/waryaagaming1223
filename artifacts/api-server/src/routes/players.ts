import { Router } from "express";
import { db } from "@workspace/db";
import { playersTable, teamsTable, matchesTable, matchPlayerGamesTable } from "@workspace/db";
import { tournamentsTable } from "@workspace/db";
import { eq, ilike, desc, sql, or } from "drizzle-orm";
import {
  ListPlayersQueryParams,
  CreatePlayerBody,
  UpdatePlayerParams,
  UpdatePlayerBody,
  GetPlayerParams,
  GetPlayerMatchHistoryParams,
} from "@workspace/api-zod";

const router = Router();

router.get("/players", async (req, res) => {
  const query = ListPlayersQueryParams.safeParse(req.query);
  if (!query.success) return res.status(400).json({ error: "Invalid query" });

  const { search, limit = 50, offset = 0 } = query.data;
  const players = await db
    .select()
    .from(playersTable)
    .where(search ? ilike(playersTable.username, `%${search}%`) : undefined)
    .limit(limit)
    .offset(offset)
    .orderBy(playersTable.rank);

  const teams = await db.select({ id: teamsTable.id, name: teamsTable.name }).from(teamsTable);
  const teamMap = new Map(teams.map((t) => [t.id, t.name]));

  return res.json(
    players.map((p) => ({
      ...p,
      teamName: p.teamId ? (teamMap.get(p.teamId) ?? null) : null,
      createdAt: p.createdAt.toISOString(),
    }))
  );
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

  return res.json({ ...player, teamName, teamLogoUrl, teamTag, teamCaptainId, createdAt: player.createdAt.toISOString() });
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

export default router;
