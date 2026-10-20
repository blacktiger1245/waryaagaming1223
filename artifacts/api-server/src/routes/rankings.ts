import { Router } from "express";
import { db } from "@workspace/db";
import { playersTable, teamsTable, hallOfFameTable, tournamentsTable, matchesTable, playerPoints, pointsToMarketValue } from "@workspace/db";
import { eq, desc, inArray, sql, and } from "drizzle-orm";
import { GetPlayerRankingsQueryParams } from "@workspace/api-zod";
import { computeAllPlayerTallies } from "../lib/stats-sync";

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

  const teams = await db
    .select({ id: teamsTable.id, name: teamsTable.name, logoUrl: teamsTable.logoUrl })
    .from(teamsTable);
  const teamMap = new Map(teams.map((t) => [t.id, t.name]));
  const teamLogoMap = new Map(teams.map((t) => [t.id, t.logoUrl]));

  const seasonId = req.query.seasonId ? Number(req.query.seasonId) : undefined;
  const period = query.data.period;

  // Scope selection: a season, a rolling window, or all-time.
  let filter: { tournamentIds?: number[]; since?: Date } = {};
  let requireTally = false;

  if (seasonId) {
    const seasonTournaments = await db
      .select({ id: tournamentsTable.id })
      .from(tournamentsTable)
      .where(eq(tournamentsTable.seasonId, seasonId));
    if (seasonTournaments.length === 0) return res.json([]);
    filter = { tournamentIds: seasonTournaments.map((t) => t.id) };
    requireTally = true;
  } else if (period === "weekly" || period === "monthly") {
    const days = period === "weekly" ? 7 : 30;
    filter = { since: new Date(Date.now() - days * 24 * 60 * 60 * 1000) };
    requireTally = true;
  }

  // Live statistics for every player: solo fixtures + clan duels + MOTM. This is
  // what makes Match / Win / Draw / Rating real for players whose club played,
  // even if the cached player columns were never filled in.
  const [players, tallies] = await Promise.all([
    db.select().from(playersTable),
    computeAllPlayerTallies(filter),
  ]);

  const ranked = players
    .map((p) => {
      const tally = tallies.get(p.id);
      const hasTally = !!tally && tally.played > 0;

      if (!hasTally) {
        return {
          player: p,
          hasTally: false,
          played: p.matchesPlayed,
          wins: p.matchesWon,
          losses: p.matchesLost,
          draws: (p as any).draws ?? 0,
          points: p.points,
          marketValue: (p as any).marketValue ?? 0,
          rating: Math.min(5, p.matchesWon),
        };
      }

      const points = playerPoints({
        appearances: tally.played,
        wins: tally.wins,
        cleanSheets: tally.cleanSheets,
        goals: tally.goals,
        motm: tally.motm,
        draws: tally.draws,
      });

      return {
        player: p,
        hasTally: true,
        played: tally.played,
        wins: tally.wins,
        losses: tally.losses,
        draws: tally.draws,
        points,
        marketValue: pointsToMarketValue(points),
        // Star rating (0–5) from real wins, so the column is never blank.
        rating: Math.min(5, tally.wins),
      };
    })
    .filter((r) => !requireTally || r.hasTally)
    .sort((a, b) => b.points - a.points || b.wins - a.wins || b.played - a.played)
    .slice(0, 50);

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
      tournamentWins: r.player.tournamentWins,
      verified: (r.player as any).verified ?? false,
      matchesPlayed: r.played,
      matchesWon: r.wins,
      matchesLost: r.losses,
      draws: r.draws,
      winRate: r.played > 0 ? r.wins / r.played : 0,
      lossRate: r.played > 0 ? r.losses / r.played : 0,
      rating: r.rating,
      marketValue: r.marketValue,
      change: r.player.previousRank > 0 ? r.player.previousRank - (i + 1) : null,
    })),
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
        matches = await db
          .select()
          .from(matchesTable)
          .where(
            and(
              inArray(matchesTable.tournamentId, tIds),
              eq(matchesTable.status, "completed"),
            ),
          );
      }
    } else if (since) {
      matches = await db
        .select()
        .from(matchesTable)
        .where(sql`${matchesTable.status} = 'completed' AND COALESCE(${matchesTable.resultSetAt}, ${matchesTable.createdAt}) >= ${since}`);
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
    const teamRows = await db
      .select()
      .from(teamsTable)
      .where(inArray(teamsTable.id, teamIds));

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
      // The teams table stores wins/losses/points (3 per win, 1 per draw), so the
      // draw count is recoverable: points − wins×3.
      const draws = Math.max(0, Math.round((t.points ?? 0) - wins * 3));
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
