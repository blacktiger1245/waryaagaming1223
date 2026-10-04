/**
 * Clan Tournament — Top Scores and Team of the Week.
 *
 * Both feeds come from ONE aggregation (`aggregateRounds`) so the numbers shown
 * in the Top Scores table and the Team of the Week pitch can never disagree.
 *
 * Scope (query params):
 *   ?tournamentId=<id>  → a single clan tournament
 *   ?seasonId=<id>      → every clan tournament in that season
 *   (neither)           → every clan tournament ("All time")
 *   ?round=<n>          → which tournament week (round) the Team of the Week
 *                         covers; defaults to the latest round with results.
 *
 * A "tournament week" is a tournament round. Every statistic is derived from the
 * score lines an administrator approved for the clan fixtures — a player game
 * counts as played once both scores are recorded (the per-game `status` column is
 * not a reliable completion signal; see clan-stats.ts).
 *
 * Tracked per player: goals, assists, matches played, wins, draws, losses, goals
 * per match and an overall performance rating.
 */
import { Router } from "express";
import { db } from "@workspace/db";
import {
  tournamentsTable,
  matchesTable,
  matchPlayerGamesTable,
  playersTable,
  teamsTable,
} from "@workspace/db";
import { eq, inArray } from "drizzle-orm";

const router = Router();

/**
 * The 4-3-3 the Team of the Week is laid out in, indexed by `rank - 1`, exactly
 * as specified: #1 → RW, #2 → ST, #3 → LW, #4-#6 → CM, #7 → RB, #8-#9 → CB,
 * #10 → LB, #11 → GK.
 */
export const TEAM_OF_THE_WEEK_FORMATION = [
  "RW",
  "ST",
  "LW",
  "CM",
  "CM",
  "CM",
  "RB",
  "CB",
  "CB",
  "LB",
  "GK",
] as const;

export type FormationSlot = (typeof TEAM_OF_THE_WEEK_FORMATION)[number];

/**
 * Performance model. The rating is a per-match figure on the familiar 0–10
 * football scale, so it rewards individual output (goals, assists) and team
 * results without letting a single big game dwarf a consistent season.
 */
const PERFORMANCE = {
  goal: 1.0,
  assist: 0.6,
  win: 0.5,
  draw: 0.15,
  loss: -0.25,
  base: 5.5,
  scale: 0.9,
} as const;

interface Bucket {
  playerId: number;
  matchesPlayed: number;
  goals: number;
  assists: number;
  wins: number;
  draws: number;
  losses: number;
}

function newBucket(playerId: number): Bucket {
  return { playerId, matchesPlayed: 0, goals: 0, assists: 0, wins: 0, draws: 0, losses: 0 };
}

/** Add one completed matchup for a player. */
function addLine(bucket: Bucket, goals: number, conceded: number, assists: number): void {
  bucket.matchesPlayed += 1;
  bucket.goals += goals;
  bucket.assists += assists;
  if (goals > conceded) bucket.wins += 1;
  else if (goals < conceded) bucket.losses += 1;
  else bucket.draws += 1;
}

/** The derived, display-ready statistic row for a player. */
interface PlayerStats {
  playerId: number;
  name: string;
  avatarUrl: string | null;
  teamId: number | null;
  teamName: string | null;
  teamTag: string | null;
  teamLogoUrl: string | null;
  goals: number;
  assists: number;
  matchesPlayed: number;
  wins: number;
  draws: number;
  losses: number;
  goalsPerMatch: number;
  performance: number;
}

/** Turn a raw bucket into the public statistic row (rating + per-match rates). */
function derive(bucket: Bucket): Omit<PlayerStats, "name" | "avatarUrl" | "teamId" | "teamName" | "teamTag" | "teamLogoUrl"> {
  const raw =
    bucket.goals * PERFORMANCE.goal +
    bucket.assists * PERFORMANCE.assist +
    bucket.wins * PERFORMANCE.win +
    bucket.draws * PERFORMANCE.draw +
    bucket.losses * PERFORMANCE.loss;

  const perMatch = raw / Math.max(1, bucket.matchesPlayed);
  const performance = Math.min(10, Math.max(0, PERFORMANCE.base + perMatch * PERFORMANCE.scale));

  return {
    playerId: bucket.playerId,
    goals: bucket.goals,
    assists: bucket.assists,
    matchesPlayed: bucket.matchesPlayed,
    wins: bucket.wins,
    draws: bucket.draws,
    losses: bucket.losses,
    goalsPerMatch: bucket.matchesPlayed > 0 ? bucket.goals / bucket.matchesPlayed : 0,
    performance: Math.round(performance * 10) / 10,
  };
}

/** Best first: rating, then goals, then assists, then volume, then name. */
function rankPlayers(rows: PlayerStats[]): PlayerStats[] {
  return [...rows].sort(
    (a, b) =>
      b.performance - a.performance ||
      b.goals - a.goals ||
      b.assists - a.assists ||
      b.matchesPlayed - a.matchesPlayed ||
      a.name.localeCompare(b.name),
  );
}

function toIntOrNull(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** The most players the Top Scores table will return. */
const MAX_TOP_SCORES = 50;

/** Display metadata attached to every statistic row. */
interface PlayerMeta {
  name: string;
  avatarUrl: string | null;
  teamId: number | null;
  teamName: string | null;
  teamTag: string | null;
  teamLogoUrl: string | null;
}

router.get("/clan-tournament/top-players", async (req, res) => {
  const seasonId = toIntOrNull(req.query.seasonId);
  const tournamentId = toIntOrNull(req.query.tournamentId);
  const requestedRound = toIntOrNull(req.query.round);

  // 1. Clan tournaments in scope.
  const clanTournaments = await db
    .select({ id: tournamentsTable.id, seasonId: tournamentsTable.seasonId })
    .from(tournamentsTable)
    .where(eq(tournamentsTable.isClanTournament, true));

  let scopeTournaments = clanTournaments;
  if (tournamentId !== null) scopeTournaments = clanTournaments.filter((t) => t.id === tournamentId);
  else if (seasonId !== null) scopeTournaments = clanTournaments.filter((t) => t.seasonId === seasonId);

  const tournamentIds = scopeTournaments.map((t) => t.id);

  if (tournamentIds.length === 0) {
    return res.json({
      scope: { seasonId, tournamentId, tournamentCount: 0, matchCount: 0, playerGameCount: 0 },
      rounds: [],
      teamOfTheWeek: { round: null, label: null, roundName: null, isComplete: false, players: [] },
      topScores: { players: [] },
    });
  }

  // 2. Fixtures and their player-vs-player games.
  const matches = await db
    .select()
    .from(matchesTable)
    .where(inArray(matchesTable.tournamentId, tournamentIds));

  const matchIds = matches.map((m) => m.id);
  const games = matchIds.length
    ? await db
        .select()
        .from(matchPlayerGamesTable)
        .where(inArray(matchPlayerGamesTable.matchId, matchIds))
    : [];

  const gamesByMatch = new Map<number, typeof games>();
  for (const game of games) {
    const list = gamesByMatch.get(game.matchId);
    if (list) list.push(game);
    else gamesByMatch.set(game.matchId, [game]);
  }

  // 3. Aggregate each tournament week (round) separately, so the Team of the
  //    Week and the overall Top Scores are built from the very same buckets.
  const roundBuckets = new Map<number, Map<number, Bucket>>();
  const bucketFor = (round: number, playerId: number): Bucket => {
    let byPlayer = roundBuckets.get(round);
    if (!byPlayer) {
      byPlayer = new Map<number, Bucket>();
      roundBuckets.set(round, byPlayer);
    }
    let bucket = byPlayer.get(playerId);
    if (!bucket) {
      bucket = newBucket(playerId);
      byPlayer.set(playerId, bucket);
    }
    return bucket;
  };

  interface RoundInfo {
    round: number;
    roundName: string | null;
    fixtures: number;
    completedFixtures: number;
    playedMatchups: number;
  }
  const roundInfo = new Map<number, RoundInfo>();

  for (const match of matches) {
    const round = match.round ?? 1;
    let info = roundInfo.get(round);
    if (!info) {
      info = { round, roundName: match.roundName ?? null, fixtures: 0, completedFixtures: 0, playedMatchups: 0 };
      roundInfo.set(round, info);
    }
    info.fixtures += 1;
    if (!info.roundName && match.roundName) info.roundName = match.roundName;

    const fixtureGames = gamesByMatch.get(match.id) ?? [];
    // A fixture counts as finished when the administrator marked it completed OR
    // every one of its player matchups has a recorded score (the admin result
    // flow writes scores and does not always flip the fixture status).
    const allMatchupsScored =
      fixtureGames.length > 0 && fixtureGames.every((g) => g.homeScore != null && g.awayScore != null);
    if (match.status === "completed" || allMatchupsScored) info.completedFixtures += 1;

    for (const game of fixtureGames) {
      // A matchup counts as played once both scores are recorded.
      if (game.homeScore == null || game.awayScore == null) continue;
      info.playedMatchups += 1;

      if (game.homePlayerId != null) {
        addLine(bucketFor(round, game.homePlayerId), game.homeScore, game.awayScore, game.homeAssists ?? 0);
      }
      if (game.awayPlayerId != null) {
        addLine(bucketFor(round, game.awayPlayerId), game.awayScore, game.homeScore, game.awayAssists ?? 0);
      }
    }
  }

  // 4. Display metadata for every player that played.
  const playerIds = new Set<number>();
  for (const byPlayer of roundBuckets.values()) {
    for (const id of byPlayer.keys()) playerIds.add(id);
  }

  const playerRows = playerIds.size
    ? await db
        .select({
          id: playersTable.id,
          username: playersTable.username,
          displayName: playersTable.displayName,
          avatarUrl: playersTable.avatarUrl,
          teamId: playersTable.teamId,
        })
        .from(playersTable)
        .where(inArray(playersTable.id, [...playerIds]))
    : [];

  const teamIds = new Set<number>();
  for (const player of playerRows) {
    if (player.teamId != null) teamIds.add(player.teamId);
  }

  const teamRows = teamIds.size
    ? await db
        .select({ id: teamsTable.id, name: teamsTable.name, tag: teamsTable.tag, logoUrl: teamsTable.logoUrl })
        .from(teamsTable)
        .where(inArray(teamsTable.id, [...teamIds]))
    : [];

  const teamMeta = new Map(teamRows.map((t) => [t.id, t]));
  const playerMeta = new Map<number, PlayerMeta>();
  for (const player of playerRows) {
    const team = player.teamId != null ? teamMeta.get(player.teamId) : undefined;
    playerMeta.set(player.id, {
      name: player.displayName?.trim() || player.username,
      avatarUrl: player.avatarUrl,
      teamId: player.teamId ?? null,
      teamName: team?.name ?? null,
      teamTag: team?.tag ?? null,
      teamLogoUrl: team?.logoUrl ?? null,
    });
  }

  /** Ranked statistic rows for one tournament week (round). */
  const statsForRound = (round: number): PlayerStats[] => {
    const byPlayer = roundBuckets.get(round);
    if (!byPlayer) return [];
    const rows: PlayerStats[] = [];
    for (const bucket of byPlayer.values()) {
      const meta = playerMeta.get(bucket.playerId);
      if (!meta) continue;
      rows.push({ ...derive(bucket), ...meta });
    }
    return rankPlayers(rows);
  };

  const rounds = [...roundInfo.values()]
    .sort((a, b) => a.round - b.round)
    .map((info) => ({
      round: info.round,
      label: info.roundName || `Round ${info.round}`,
      roundName: info.roundName,
      fixtures: info.fixtures,
      completedFixtures: info.completedFixtures,
      playedMatchups: info.playedMatchups,
      /** A finished week: every fixture in the round is completed. */
      isComplete: info.fixtures > 0 && info.completedFixtures === info.fixtures,
    }));

  // The week shown by default is the latest one that actually has results.
  const weeksWithResults = rounds.filter((r) => r.playedMatchups > 0);
  const fallbackRound = weeksWithResults.at(-1)?.round ?? rounds.at(-1)?.round ?? null;
  const activeRound =
    requestedRound != null && roundInfo.has(requestedRound) ? requestedRound : fallbackRound;
  const activeWeek = activeRound != null ? rounds.find((r) => r.round === activeRound) ?? null : null;

  const weekPlayers = activeRound != null ? statsForRound(activeRound) : [];

  // ── Top Scores: the same statistic rows aggregated over the whole scope ──
  const overall = new Map<number, Bucket>();
  for (const byPlayer of roundBuckets.values()) {
    for (const bucket of byPlayer.values()) {
      let total = overall.get(bucket.playerId);
      if (!total) {
        total = newBucket(bucket.playerId);
        overall.set(bucket.playerId, total);
      }
      total.matchesPlayed += bucket.matchesPlayed;
      total.goals += bucket.goals;
      total.assists += bucket.assists;
      total.wins += bucket.wins;
      total.draws += bucket.draws;
      total.losses += bucket.losses;
    }
  }

  const topScores = rankPlayers(
    [...overall.values()].flatMap((bucket) => {
      const meta = playerMeta.get(bucket.playerId);
      return meta ? [{ ...derive(bucket), ...meta }] : [];
    }),
  ).slice(0, MAX_TOP_SCORES);

  return res.json({
    scope: {
      seasonId,
      tournamentId,
      tournamentCount: tournamentIds.length,
      matchCount: matches.length,
      playerGameCount: games.length,
    },
    rounds,
    teamOfTheWeek: {
      round: activeRound,
      label: activeWeek?.label ?? null,
      roundName: activeWeek?.roundName ?? null,
      isComplete: activeWeek?.isComplete ?? false,
      players: weekPlayers.slice(0, TEAM_OF_THE_WEEK_FORMATION.length).map((stats, index) => ({
        rank: index + 1,
        position: TEAM_OF_THE_WEEK_FORMATION[index],
        ...stats,
      })),
    },
    topScores: {
      players: topScores.map((stats, index) => ({ rank: index + 1, ...stats })),
    },
  });
});

export default router;
