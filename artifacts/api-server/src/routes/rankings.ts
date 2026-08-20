import { Router } from "express";
import { db } from "@workspace/db";
import { playersTable, teamsTable, hallOfFameTable, tournamentsTable, matchesTable } from "@workspace/db";
import { eq, desc, inArray, sql } from "drizzle-orm";
import { GetPlayerRankingsQueryParams } from "@workspace/api-zod";

const router = Router();

// ── Shared ranking helpers (weekly / monthly) ─────────────────────────────────
type Match = typeof matchesTable.$inferSelect;

function aggregateMatches(matches: Match[]) {
  const statsMap = new Map<number, { wins: number; losses: number; draws: number; points: number }>();
  const ensurePlayer = (id: number) => {
    if (!statsMap.has(id)) statsMap.set(id, { wins: 0, losses: 0, draws: 0, points: 0 });
    return statsMap.get(id)!;
  };

  for (const m of matches) {
    const p1 = m.participant1Id;
    const p2 = m.participant2Id;
    if (!p1 || !p2) continue;

    if (m.winnerId != null) {
      const winnerId = m.winnerId;
      const loserId = winnerId === p1 ? p2 : p1;
      ensurePlayer(winnerId).wins += 1;
      ensurePlayer(winnerId).points += 3;
      ensurePlayer(loserId).losses += 1;
    } else {
      // draw
      ensurePlayer(p1).draws += 1;
      ensurePlayer(p1).points += 1;
      ensurePlayer(p2).draws += 1;
      ensurePlayer(p2).points += 1;
    }
  }
  return statsMap;
}

function rankWithStats(players: typeof playersTable.$inferSelect[], statsMap: Map<number, { wins: number; losses: number; draws: number; points: number }>) {
  return players
    .map((player) => {
      const s = statsMap.get(player.id) ?? { wins: 0, losses: 0, draws: 0, points: 0 };
      return { player, ...s, matchesPlayed: s.wins + s.losses + s.draws };
    })
    .sort((a, b) => b.points - a.points || b.wins - a.wins);
}

function serializeRanked(
  ranked: ReturnType<typeof rankWithStats>,
  teamMap: Map<number, string>,
  teamLogoMap: Map<number, string | null>,
) {
  return ranked.map((r, i) => ({
    rank: i + 1,
    playerId: r.player.id,
    username: r.player.username,
    displayName: r.player.displayName,
    avatarUrl: r.player.avatarUrl,
    teamName: r.player.teamId ? (teamMap.get(r.player.teamId) ?? null) : null,
    teamLogoUrl: r.player.teamId ? (teamLogoMap.get(r.player.teamId) ?? null) : null,
    points: r.points,
    matchesPlayed: r.matchesPlayed,
    matchesWon: r.wins,
    matchesLost: r.losses,
    draws: r.draws,
    winRate: r.matchesPlayed > 0 ? r.wins / r.matchesPlayed : 0,
    lossRate: r.matchesPlayed > 0 ? r.losses / r.matchesPlayed : 0,
    tournamentWins: r.player.tournamentWins,
    verified: (r.player as any).verified ?? false,
    rating: (r.player as any).rating ?? 0,
    marketValue: (r.player as any).marketValue ?? 0,
    change: null,
  }));
}

router.get("/rankings/players", async (req, res) => {
  res.set("Cache-Control", "no-store");
  const query = GetPlayerRankingsQueryParams.safeParse(req.query);
  if (!query.success) return res.status(400).json({ error: "Invalid query" });

  const seasonId = req.query.seasonId ? Number(req.query.seasonId) : undefined;

  const teams = await db.select({ id: teamsTable.id, name: teamsTable.name, logoUrl: teamsTable.logoUrl }).from(teamsTable);
  const teamMap = new Map(teams.map((t) => [t.id, t.name]));
  const teamLogoMap = new Map(teams.map((t) => [t.id, t.logoUrl]));

  // ── Seasonal: aggregate match stats for tournaments in this season ────────
  if (seasonId) {
    const seasonTournaments = await db
      .select({ id: tournamentsTable.id })
      .from(tournamentsTable)
      .where(eq(tournamentsTable.seasonId, seasonId));

    const tournamentIds = seasonTournaments.map((t) => t.id);

    if (tournamentIds.length === 0) {
      return res.json([]);
    }

    const matches = await db
      .select()
      .from(matchesTable)
      .where(
        sql`${matchesTable.tournamentId} = ANY(ARRAY[${sql.join(tournamentIds.map((id) => sql`${id}`), sql`, `)}]) AND ${matchesTable.status} = 'completed'`
      );

    // Aggregate per player
    const statsMap = new Map<number, { wins: number; losses: number; draws: number; points: number }>();

    const ensurePlayer = (id: number) => {
      if (!statsMap.has(id)) statsMap.set(id, { wins: 0, losses: 0, draws: 0, points: 0 });
      return statsMap.get(id)!;
    };

    for (const m of matches) {
      const p1 = m.participant1Id;
      const p2 = m.participant2Id;
      if (!p1 || !p2) continue;

      if (m.winnerId != null) {
        const winnerId = m.winnerId;
        const loserId = winnerId === p1 ? p2 : p1;
        ensurePlayer(winnerId).wins += 1;
        ensurePlayer(winnerId).points += 3;
        ensurePlayer(loserId).losses += 1;
      } else {
        // draw
        ensurePlayer(p1).draws += 1;
        ensurePlayer(p1).points += 1;
        ensurePlayer(p2).draws += 1;
        ensurePlayer(p2).points += 1;
      }
    }

    if (statsMap.size === 0) return res.json([]);

    const playerIds = [...statsMap.keys()];
    const idArray = sql`ARRAY[${sql.join(playerIds.map((id) => sql`${id}`), sql`, `)}]`;
    const players = await db
      .select()
      .from(playersTable)
      .where(sql`${playersTable.id} = ANY(${idArray})`);

    const ranked = players
      .map((p) => {
        const s = statsMap.get(p.id) ?? { wins: 0, losses: 0, draws: 0, points: 0 };
        return { player: p, ...s, matchesPlayed: s.wins + s.losses + s.draws };
      })
      .sort((a, b) => b.points - a.points || b.wins - a.wins);

    return res.json(
      ranked.map((r, i) => ({
        rank: i + 1,
        playerId: r.player.id,
        username: r.player.username,
        displayName: r.player.displayName,
        avatarUrl: r.player.avatarUrl,
        teamName: r.player.teamId ? (teamMap.get(r.player.teamId) ?? null) : null,
        teamLogoUrl: r.player.teamId ? (teamLogoMap.get(r.player.teamId) ?? null) : null,
        points: r.points,
        matchesPlayed: r.matchesPlayed,
        matchesWon: r.wins,
        matchesLost: r.losses,
        draws: r.draws,
        winRate: r.matchesPlayed > 0 ? r.wins / r.matchesPlayed : 0,
        lossRate: r.matchesPlayed > 0 ? r.losses / r.matchesPlayed : 0,
        tournamentWins: r.player.tournamentWins,
        verified: (r.player as any).verified ?? false,
        rating: (r.player as any).rating ?? 0,
        marketValue: (r.player as any).marketValue ?? 0,
        change: null,
      }))
    );
  }

  // ── Weekly / Monthly: completed matches within a rolling window ───────────
  const period = query.data.period;
  if (period === "weekly" || period === "monthly") {
    const days = period === "weekly" ? 7 : 30;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const matches = await db
      .select()
      .from(matchesTable)
      .where(
        sql`${matchesTable.status} = 'completed' AND ${matchesTable.createdAt} >= ${since}`,
      );

    const statsMap = aggregateMatches(matches);
    if (statsMap.size === 0) return res.json([]);

    const playerIds = [...statsMap.keys()];
    const idArray = sql`ARRAY[${sql.join(playerIds.map((id) => sql`${id}`), sql`, `)}]`;
    const players = await db
      .select()
      .from(playersTable)
      .where(sql`${playersTable.id} = ANY(${idArray})`);

    const ranked = rankWithStats(players, statsMap);
    return res.json(serializeRanked(ranked, teamMap, teamLogoMap));
  }

  // ── Overall / all-time ────────────────────────────────────────────────────
  const players = await db
    .select()
    .from(playersTable)
    .orderBy(desc(playersTable.points))
    .limit(50);

  const sorted = [...players].sort((a, b) => b.points - a.points);

  return res.json(
    sorted.map((p, i) => ({
      rank: i + 1,
      playerId: p.id,
      username: p.username,
      displayName: p.displayName,
      avatarUrl: p.avatarUrl,
      teamName: p.teamId ? (teamMap.get(p.teamId) ?? null) : null,
      teamLogoUrl: p.teamId ? (teamLogoMap.get(p.teamId) ?? null) : null,
      points: p.points,
      tournamentWins: p.tournamentWins,
      verified: (p as any).verified ?? false,
      matchesPlayed: p.matchesPlayed,
      matchesWon: p.matchesWon,
      matchesLost: p.matchesLost,
      draws: (p as any).draws ?? 0,
      winRate: p.winRate,
      lossRate: p.lossRate,
      rating: (p as any).rating ?? 0,
      marketValue: (p as any).marketValue ?? 0,
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

  // ── Seasonal / Weekly / Monthly: aggregate team-format matches in scope ────
  const seasonId = req.query.seasonId ? Number(req.query.seasonId) : undefined;
  const period = (req.query.period as string | undefined) || undefined;
  const hasSeason = seasonId != null && !Number.isNaN(seasonId);
  const isWindowed = period === "weekly" || period === "monthly";

  if (hasSeason || isWindowed) {
    const days = period === "weekly" ? 7 : period === "monthly" ? 30 : null;
    const since = days ? new Date(Date.now() - days * 24 * 60 * 60 * 1000) : null;

    let matches: typeof matchesTable.$inferSelect[] = [];
    if (hasSeason) {
      const seasonTournaments = await db
        .select({ id: tournamentsTable.id })
        .from(tournamentsTable)
        .where(eq(tournamentsTable.seasonId, seasonId!));
      const tIds = seasonTournaments.map((t) => t.id);
      if (tIds.length > 0) {
        const idArr = sql`ARRAY[${sql.join(tIds.map((id) => sql`${id}`), sql`, `)}]`;
        matches = await db
          .select()
          .from(matchesTable)
          .where(sql`${matchesTable.tournamentId} = ANY(${idArr}) AND ${matchesTable.status} = 'completed'`);
      }
    } else if (since) {
      matches = await db
        .select()
        .from(matchesTable)
        .where(sql`${matchesTable.status} = 'completed' AND ${matchesTable.createdAt} >= ${since}`);
    }

    // Keep only team-format matches (their participant ids are team ids).
    const tIds = [...new Set(matches.map((m) => m.tournamentId))];
    let teamTournamentIds = new Set<number>();
    if (tIds.length > 0) {
      const tournRows = await db
        .select({ id: tournamentsTable.id, tournamentType: tournamentsTable.tournamentType })
        .from(tournamentsTable)
        .where(inArray(tournamentsTable.id, tIds));
      teamTournamentIds = new Set(
        tournRows.filter((r) => r.tournamentType === "team").map((r) => r.id),
      );
    }
    const teamMatches = matches.filter((m) => teamTournamentIds.has(m.tournamentId));

    const statsMap = new Map<number, { wins: number; losses: number; draws: number; points: number }>();
    const ensure = (id: number) => {
      if (!statsMap.has(id)) statsMap.set(id, { wins: 0, losses: 0, draws: 0, points: 0 });
      return statsMap.get(id)!;
    };
    for (const m of teamMatches) {
      const t1 = m.participant1Id;
      const t2 = m.participant2Id;
      if (!t1 || !t2) continue;
      if (m.winnerId != null) {
        const w = m.winnerId;
        const l = w === t1 ? t2 : t1;
        ensure(w).wins += 1;
        ensure(w).points += 3;
        ensure(l).losses += 1;
      } else {
        ensure(t1).draws += 1;
        ensure(t1).points += 1;
        ensure(t2).draws += 1;
        ensure(t2).points += 1;
      }
    }

    if (statsMap.size === 0) return res.json([]);

    const teamIds = [...statsMap.keys()];
    const teamIdArr = sql`ARRAY[${sql.join(teamIds.map((id) => sql`${id}`), sql`, `)}]`;
    const teamRows = await db
      .select()
      .from(teamsTable)
      .where(sql`${teamsTable.id} = ANY(${teamIdArr})`);

    const rankedTeams = teamRows
      .map((team) => {
        const s = statsMap.get(team.id) ?? { wins: 0, losses: 0, draws: 0, points: 0 };
        return { team, ...s, matchesPlayed: s.wins + s.losses + s.draws };
      })
      .sort((a, b) => b.points - a.points || b.wins - a.wins);

    return res.json(
      rankedTeams.map((r, i) => {
        const starRating = r.matchesPlayed > 0 ? Math.min(5, Math.round((r.wins / r.matchesPlayed) * 5)) : 0;
        return {
          rank: i + 1,
          teamId: r.team.id,
          name: r.team.name,
          tag: r.team.tag,
          logoUrl: r.team.logoUrl,
          points: r.points,
          wins: r.wins,
          losses: r.losses,
          draws: r.draws,
          matchesPlayed: r.matchesPlayed,
          starRating,
          memberCount: memberCounts.get(r.team.id) ?? 0,
          change: null,
        };
      }),
    );
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
