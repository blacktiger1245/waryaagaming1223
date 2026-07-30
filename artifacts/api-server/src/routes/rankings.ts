import { Router } from "express";
import { db } from "@workspace/db";
import { playersTable, teamsTable, hallOfFameTable } from "@workspace/db";
import { eq, desc, asc } from "drizzle-orm";
import { GetPlayerRankingsQueryParams } from "@workspace/api-zod";

const router = Router();

router.get("/rankings/players", async (req, res) => {
  res.set("Cache-Control", "no-store");
  const query = GetPlayerRankingsQueryParams.safeParse(req.query);
  if (!query.success) return res.status(400).json({ error: "Invalid query" });

  const players = await db
    .select()
    .from(playersTable)
    .orderBy(desc(playersTable.points))
    .limit(50);

  const sorted = [...players].sort((a, b) => b.points - a.points);

  const teams = await db.select({ id: teamsTable.id, name: teamsTable.name }).from(teamsTable);
  const teamMap = new Map(teams.map((t) => [t.id, t.name]));

  return res.json(
    sorted.map((p, i) => ({
      rank: i + 1,
      playerId: p.id,
      username: p.username,
      displayName: p.displayName,
      avatarUrl: p.avatarUrl,
      teamName: p.teamId ? (teamMap.get(p.teamId) ?? null) : null,
      points: p.points,
      tournamentWins: p.tournamentWins,
      matchesPlayed: p.matchesPlayed,
      matchesWon: p.matchesWon,
      matchesLost: p.matchesLost,
      draws: (p as any).draws ?? 0,
      winRate: p.winRate,
      lossRate: p.lossRate,
      rating: (p as any).rating ?? 0,
      marketValue: (p as any).marketValue ?? 0,
      // previousRank 0 means never ranked before → no change to show
      change: p.previousRank > 0 ? p.previousRank - (i + 1) : null,
    }))
  );
});

router.get("/rankings/teams", async (req, res) => {
  const teams = await db.select().from(teamsTable).orderBy(desc(teamsTable.points)).limit(50);

  // member counts
  const allPlayers = await db.select({ teamId: playersTable.teamId }).from(playersTable);
  const memberCounts = new Map<number, number>();
  for (const p of allPlayers) {
    if (p.teamId != null) memberCounts.set(p.teamId, (memberCounts.get(p.teamId) ?? 0) + 1);
  }

  return res.json(
    teams.map((t, i) => {
      const wins = t.wins ?? 0;
      const losses = t.losses ?? 0;
      const draws = (t as any).draws ?? 0;
      const matchesPlayed = wins + losses + draws;
      // star rating: 1 star per win up to 5, scaled by win rate if >5 wins
      const starRating = matchesPlayed > 0 ? Math.min(5, Math.round((wins / matchesPlayed) * 5)) : 0;
      return {
        rank: i + 1,
        teamId: t.id,
        name: t.name,
        tag: t.tag,
        logoUrl: t.logoUrl,
        points: t.points,
        wins,
        losses,
        draws,
        matchesPlayed,
        starRating,
        memberCount: memberCounts.get(t.id) ?? 0,
        change: null,
        recentForm: [] as string[],
      };
    })
  );
});

router.get("/rankings/hall-of-fame", async (req, res) => {
  const entries = await db
    .select()
    .from(hallOfFameTable)
    .orderBy(desc(hallOfFameTable.year));

  const result = await Promise.all(
    entries.map(async (e) => {
      const [player] = await db
        .select({ username: playersTable.username, displayName: playersTable.displayName, avatarUrl: playersTable.avatarUrl })
        .from(playersTable)
        .where(eq(playersTable.id, e.playerId));
      return {
        id: e.id,
        playerId: e.playerId,
        username: player?.username ?? "Unknown",
        displayName: player?.displayName ?? null,
        avatarUrl: player?.avatarUrl ?? null,
        achievement: e.achievement,
        year: e.year,
        description: e.description,
      };
    })
  );

  return res.json(result);
});

export default router;
