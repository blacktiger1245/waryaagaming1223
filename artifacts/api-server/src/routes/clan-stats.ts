/**
 * Clan Tournament statistics — the data feed for the Player stats and Team stats
 * tabs.
 *
 * Everything is derived from what an administrator confirmed against the result
 * screenshot: the per-player statistics stored on `match_player_games` rows
 * (score, possession, shots, shots on target, completed passes) plus each
 * fixture's Man of the Match. Nothing is invented — a statistic that was never
 * recorded simply does not contribute to its leaderboard.
 *
 * Scope (query params):
 *   ?tournamentId=<id>  → a single clan tournament
 *   ?seasonId=<id>      → every clan tournament in that season
 *   (neither)           → every clan tournament ("All time")
 *
 * Granularity:
 *   • Player leaderboards are built from each player's own per-matchup stat
 *     lines (one row per player-vs-player game inside a clan fixture).
 *   • Team leaderboards use the fixture result (W/D/L, streaks, clean sheets) for
 *     the outcome metrics and the aggregate of the clan's players' stat lines for
 *     the counting / averaging metrics.
 *
 * Note on passes: the platform records a single pass statistic, stored as
 * `successful_passes` (completed passes). There is deliberately no separate
 * "total passes" column, so the pass leaderboards are labelled as completed
 * passes.
 */
import { Router } from "express";
import { db } from "@workspace/db";
import {
  tournamentsTable,
  matchesTable,
  matchPlayerGamesTable,
  playersTable,
  teamsTable,
  tournamentParticipantsTable,
  playerTransfersTable,
} from "@workspace/db";
import { eq, inArray, and, or, desc, aliasedTable } from "drizzle-orm";

const router = Router();

type ResultLetter = "W" | "D" | "L";
type Unit = "count" | "games" | "percent" | "average";

// ── Aggregates ────────────────────────────────────────────────────────────────
// One bucket per player (their own matchups) and per clan (their fixtures +
// their players' matchups). Sums carry a matching "count" so averages divide by
// the number of games the statistic was actually recorded in.
interface Bucket {
  appearances: number;
  wins: number;
  goals: number;
  cleanSheets: number;
  motm: number;
  possessionSum: number;
  possessionCount: number;
  shotsSum: number;
  shotsCount: number;
  shotsOnTargetSum: number;
  shotsOnTargetCount: number;
  passesSum: number;
  passesCount: number;
  /** Chronological result letters, used for the streak leaderboards. */
  results: ResultLetter[];
}

function newBucket(): Bucket {
  return {
    appearances: 0,
    wins: 0,
    goals: 0,
    cleanSheets: 0,
    motm: 0,
    possessionSum: 0,
    possessionCount: 0,
    shotsSum: 0,
    shotsCount: 0,
    shotsOnTargetSum: 0,
    shotsOnTargetCount: 0,
    passesSum: 0,
    passesCount: 0,
    results: [],
  };
}

function bucketFor(map: Map<number, Bucket>, id: number): Bucket {
  let bucket = map.get(id);
  if (!bucket) {
    bucket = newBucket();
    map.set(id, bucket);
  }
  return bucket;
}

function outcome(my: number, opp: number): ResultLetter {
  if (my > opp) return "W";
  if (my < opp) return "L";
  return "D";
}

/** Longest run of consecutive wins, or of games without a loss. */
function longestRun(results: ResultLetter[], kind: "W" | "unbeaten"): number {
  let best = 0;
  let current = 0;
  for (const result of results) {
    const counts = kind === "W" ? result === "W" : result !== "L";
    if (counts) {
      current += 1;
      if (current > best) best = current;
    } else {
      current = 0;
    }
  }
  return best;
}

/** Add one completed player-vs-player stat line to a player's bucket. */
function addPlayerLine(
  bucket: Bucket,
  my: number,
  opp: number,
  possession: number | null,
  shots: number | null,
  shotsOnTarget: number | null,
  passes: number | null,
): void {
  bucket.appearances += 1;
  bucket.results.push(outcome(my, opp));
  if (my > opp) bucket.wins += 1;
  bucket.goals += my;
  if (opp === 0) bucket.cleanSheets += 1;
  if (possession != null) {
    bucket.possessionSum += possession;
    bucket.possessionCount += 1;
  }
  if (shots != null) {
    bucket.shotsSum += shots;
    bucket.shotsCount += 1;
  }
  if (shotsOnTarget != null) {
    bucket.shotsOnTargetSum += shotsOnTarget;
    bucket.shotsOnTargetCount += 1;
  }
  if (passes != null) {
    bucket.passesSum += passes;
    bucket.passesCount += 1;
  }
}

/** One statistic reading from one side of a player game. */
interface StatLine {
  possession: number | null;
  shots: number | null;
  shotsOnTarget: number | null;
  passes: number | null;
}

/**
 * Roll a clan's fixture into its team bucket (goals, clean sheet, averages).
 * A clean sheet is only credited when the fixture actually had played games
 * (`lines` non-empty) — otherwise a completed fixture whose child matchups carry
 * no statistics would hand a spurious 0–0 clean sheet to both clans.
 */
function addTeamFixture(
  bucket: Bucket,
  myGoals: number,
  oppGoals: number,
  lines: StatLine[],
): void {
  bucket.goals += myGoals;
  if (lines.length > 0 && oppGoals === 0) bucket.cleanSheets += 1;
  for (const line of lines) {
    if (line.possession != null) {
      bucket.possessionSum += line.possession;
      bucket.possessionCount += 1;
    }
    if (line.shots != null) {
      bucket.shotsSum += line.shots;
      bucket.shotsCount += 1;
    }
    if (line.shotsOnTarget != null) {
      bucket.shotsOnTargetSum += line.shotsOnTarget;
      bucket.shotsOnTargetCount += 1;
    }
    if (line.passes != null) {
      bucket.passesSum += line.passes;
      bucket.passesCount += 1;
    }
  }
}

function toIntOrNull(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

// ── Leaderboards ──────────────────────────────────────────────────────────────
// The single source of truth for the leaderboard list, shared by the player and
// team feeds so both always stay in step. `unit` tells the UI how to format the
// value (whole counts, game counts, possession percentage or a 1-decimal average).
interface Metric {
  key: string;
  title: string;
  unit: Unit;
  value: (bucket: Bucket) => number;
  note?: string;
}

const PASS_NOTE = "Passes are recorded as completed (successful) passes.";

const METRICS: Metric[] = [
  {
    key: "longest-unbeaten-run",
    title: "Longest Unbeaten Run",
    unit: "games",
    value: (b) => longestRun(b.results, "unbeaten"),
  },
  {
    key: "longest-winning-streak",
    title: "Longest Winning Streak",
    unit: "games",
    value: (b) => longestRun(b.results, "W"),
  },
  {
    key: "most-motm",
    title: "Most Man of the Matches",
    unit: "count",
    value: (b) => b.motm,
  },
  {
    key: "most-wins",
    title: "Most Wins",
    unit: "count",
    value: (b) => b.wins,
  },
  {
    key: "most-goals",
    title: "Most Goals Scored",
    unit: "count",
    value: (b) => b.goals,
  },
  {
    key: "avg-goals",
    title: "Highest Average Goals Scored per Game",
    unit: "average",
    value: (b) => (b.appearances > 0 ? b.goals / b.appearances : 0),
  },
  {
    key: "most-clean-sheets",
    title: "Most Clean Sheets",
    unit: "count",
    value: (b) => b.cleanSheets,
  },
  {
    key: "avg-possession",
    title: "Highest Average Possession per Game",
    unit: "percent",
    value: (b) => (b.possessionCount > 0 ? b.possessionSum / b.possessionCount : 0),
  },
  {
    key: "most-shots",
    title: "Most Total Shots",
    unit: "count",
    value: (b) => b.shotsSum,
  },
  {
    key: "most-shots-on-target",
    title: "Most Total Shots on Target",
    unit: "count",
    value: (b) => b.shotsOnTargetSum,
  },
  {
    key: "avg-shots",
    title: "Highest Average Shots per Game",
    unit: "average",
    value: (b) => (b.shotsCount > 0 ? b.shotsSum / b.shotsCount : 0),
  },
  {
    key: "most-passes",
    title: "Most Completed Passes",
    unit: "count",
    value: (b) => b.passesSum,
    note: PASS_NOTE,
  },
  {
    key: "avg-passes",
    title: "Highest Average Completed Passes per Game",
    unit: "average",
    value: (b) => (b.passesCount > 0 ? b.passesSum / b.passesCount : 0),
    note: PASS_NOTE,
  },
];

const MAX_ENTRIES = 10;

interface EntryMeta {
  id: number;
  name: string;
  avatarUrl: string | null;
  teamName: string | null;
  teamTag: string | null;
}

interface RankedBucket {
  bucket: Bucket;
  meta: EntryMeta;
}

/** Turn the accumulated buckets into the ranked top-10 for every metric. */
function buildLeaderboards(ranked: Map<number, RankedBucket>) {
  return METRICS.map((metric) => {
    const entries = [...ranked.values()]
      .map(({ bucket, meta }) => ({ ...meta, value: metric.value(bucket) }))
      .filter((entry) => Number.isFinite(entry.value) && entry.value > 0)
      .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name))
      .slice(0, MAX_ENTRIES);

    return {
      key: metric.key,
      title: metric.title,
      unit: metric.unit,
      note: metric.note ?? null,
      entries,
    };
  });
}

function emptyLeaderboards() {
  return METRICS.map((metric) => ({
    key: metric.key,
    title: metric.title,
    unit: metric.unit,
    note: metric.note ?? null,
    entries: [] as Array<EntryMeta & { value: number }>,
  }));
}

router.get("/clan-tournament/stats", async (req, res) => {
  const seasonId = toIntOrNull(req.query.seasonId);
  const tournamentId = toIntOrNull(req.query.tournamentId);

  // 1. Resolve which clan tournaments are in scope.
  const clanTournaments = await db
    .select({ id: tournamentsTable.id, seasonId: tournamentsTable.seasonId })
    .from(tournamentsTable)
    .where(eq(tournamentsTable.isClanTournament, true));

  let scope = clanTournaments;
  if (tournamentId !== null) scope = clanTournaments.filter((t) => t.id === tournamentId);
  else if (seasonId !== null) scope = clanTournaments.filter((t) => t.seasonId === seasonId);

  const tournamentIds = scope.map((t) => t.id);

  if (tournamentIds.length === 0) {
    return res.json({
      scope: { seasonId, tournamentId, tournamentCount: 0, matchCount: 0, playerGameCount: 0 },
      players: emptyLeaderboards(),
      teams: emptyLeaderboards(),
    });
  }

  // 2. Every fixture in scope, and every player-vs-player game inside them.
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

  // 3. Names / avatars / crests for everything referenced above.
  const playerIds = new Set<number>();
  for (const match of matches) {
    if (match.manOfTheMatchId != null) playerIds.add(match.manOfTheMatchId);
  }
  for (const game of games) {
    if (game.homePlayerId != null) playerIds.add(game.homePlayerId);
    if (game.awayPlayerId != null) playerIds.add(game.awayPlayerId);
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
  for (const match of matches) {
    if (match.participant1Id != null) teamIds.add(match.participant1Id);
    if (match.participant2Id != null) teamIds.add(match.participant2Id);
  }
  for (const player of playerRows) {
    if (player.teamId != null) teamIds.add(player.teamId);
  }

  const teamRows = teamIds.size
    ? await db
        .select({
          id: teamsTable.id,
          name: teamsTable.name,
          tag: teamsTable.tag,
          logoUrl: teamsTable.logoUrl,
        })
        .from(teamsTable)
        .where(inArray(teamsTable.id, [...teamIds]))
    : [];

  const playerMeta = new Map(playerRows.map((p) => [p.id, p]));
  const teamMeta = new Map(teamRows.map((t) => [t.id, t]));

  const gamesByMatch = new Map<number, typeof games>();
  for (const game of games) {
    const list = gamesByMatch.get(game.matchId);
    if (list) list.push(game);
    else gamesByMatch.set(game.matchId, [game]);
  }

  // 4. Walk the fixtures oldest → newest so streaks are chronological.
  const orderedMatches = [...matches].sort((a, b) => {
    const aKey = a.scheduledAt ?? a.createdAt.toISOString();
    const bKey = b.scheduledAt ?? b.createdAt.toISOString();
    return aKey.localeCompare(bKey) || a.id - b.id;
  });

  const playerBuckets = new Map<number, Bucket>();
  const teamBuckets = new Map<number, Bucket>();

  for (const match of orderedMatches) {
    // A player game counts as played as soon as both scores are recorded. The
    // per-game `status` column is NOT a reliable signal: the admin result flow
    // writes the scores and lets the parent fixture carry the match state, so
    // many played games remain `scheduled`. The parent fixture's own status
    // still gates the team win/streak/clean-sheet metrics below.
    const fixtureGames = (gamesByMatch.get(match.id) ?? []).filter(
      (g) => g.homeScore != null && g.awayScore != null,
    );

    const team1 = match.participant1Id;
    const team2 = match.participant2Id;
    const fixtureCompleted =
      match.status === "completed" &&
      team1 != null &&
      team2 != null &&
      match.participant1Score != null &&
      match.participant2Score != null;

    // ── Player stat lines (one per player-vs-player game) ──
    for (const game of fixtureGames) {
      if (game.homePlayerId != null) {
        addPlayerLine(
          bucketFor(playerBuckets, game.homePlayerId),
          game.homeScore!,
          game.awayScore!,
          game.homePossession,
          game.homeShots,
          game.homeShotsOnTarget,
          game.homeSuccessfulPasses,
        );
      }
      if (game.awayPlayerId != null) {
        addPlayerLine(
          bucketFor(playerBuckets, game.awayPlayerId),
          game.awayScore!,
          game.homeScore!,
          game.awayPossession,
          game.awayShots,
          game.awayShotsOnTarget,
          game.awaySuccessfulPasses,
        );
      }
    }

    if (!fixtureCompleted) continue;

    const t1 = team1!;
    const t2 = team2!;
    const score1 = match.participant1Score!;
    const score2 = match.participant2Score!;

    // ── Fixture outcome + per-clan aggregate ──
    let homeGoals = 0;
    let awayGoals = 0;
    const homeLines: StatLine[] = [];
    const awayLines: StatLine[] = [];
    for (const game of fixtureGames) {
      homeGoals += game.homeScore ?? 0;
      awayGoals += game.awayScore ?? 0;
      homeLines.push({
        possession: game.homePossession,
        shots: game.homeShots,
        shotsOnTarget: game.homeShotsOnTarget,
        passes: game.homeSuccessfulPasses,
      });
      awayLines.push({
        possession: game.awayPossession,
        shots: game.awayShots,
        shotsOnTarget: game.awayShotsOnTarget,
        passes: game.awaySuccessfulPasses,
      });
    }

    const homeBucket = bucketFor(teamBuckets, t1);
    homeBucket.appearances += 1;
    homeBucket.results.push(outcome(score1, score2));
    if (score1 > score2) homeBucket.wins += 1;
    addTeamFixture(homeBucket, homeGoals, awayGoals, homeLines);

    const awayBucket = bucketFor(teamBuckets, t2);
    awayBucket.appearances += 1;
    awayBucket.results.push(outcome(score2, score1));
    if (score2 > score1) awayBucket.wins += 1;
    addTeamFixture(awayBucket, awayGoals, homeGoals, awayLines);

    // ── Man of the Match (one per fixture, credited to the player + their clan) ──
    if (match.manOfTheMatchId != null) {
      bucketFor(playerBuckets, match.manOfTheMatchId).motm += 1;

      const isHomePlayer = fixtureGames.some((g) => g.homePlayerId === match.manOfTheMatchId);
      const isAwayPlayer = fixtureGames.some((g) => g.awayPlayerId === match.manOfTheMatchId);
      if (isHomePlayer) bucketFor(teamBuckets, t1).motm += 1;
      else if (isAwayPlayer) bucketFor(teamBuckets, t2).motm += 1;
    }
  }

  // 5. Attach display metadata and rank every leaderboard.
  const rankedPlayers = new Map<number, RankedBucket>();
  for (const [id, bucket] of playerBuckets) {
    const player = playerMeta.get(id);
    if (!player) continue;
    const team = player.teamId != null ? teamMeta.get(player.teamId) : undefined;
    rankedPlayers.set(id, {
      bucket,
      meta: {
        id,
        name: player.displayName?.trim() || player.username,
        avatarUrl: player.avatarUrl,
        teamName: team?.name ?? null,
        teamTag: team?.tag ?? null,
      },
    });
  }

  const rankedTeams = new Map<number, RankedBucket>();
  for (const [id, bucket] of teamBuckets) {
    const team = teamMeta.get(id);
    if (!team) continue;
    rankedTeams.set(id, {
      bucket,
      meta: {
        id,
        name: team.name,
        avatarUrl: team.logoUrl,
        teamName: team.name,
        teamTag: team.tag,
      },
    });
  }

  return res.json({
    scope: {
      seasonId,
      tournamentId,
      tournamentCount: tournamentIds.length,
      matchCount: matches.length,
      playerGameCount: games.length,
    },
    players: buildLeaderboards(rankedPlayers),
    teams: buildLeaderboards(rankedTeams),
  });
});

/**
 * GET /clan-tournament/standings — the clan league table.
 *
 * Unlike the generic /rankings/teams feed (which only lists clans that already
 * have a completed result), this lists EVERY clan enrolled in the clan
 * tournaments in scope, so the table is complete from day one. Each clan's
 * record is computed from that scope's COMPLETED fixtures; a clan with no
 * results yet simply shows zeros.
 *
 * Scope: ?tournamentId=<id> → one clan tournament, ?seasonId=<id> → every clan
 * tournament in that season, neither → all clan tournaments.
 */
router.get("/clan-tournament/standings", async (req, res) => {
  const seasonId = toIntOrNull(req.query.seasonId);
  const tournamentId = toIntOrNull(req.query.tournamentId);

  // 1. Clan tournaments in scope (a clan tournament may be flagged either way).
  const clanTournaments = await db
    .select({ id: tournamentsTable.id, seasonId: tournamentsTable.seasonId })
    .from(tournamentsTable)
    .where(or(eq(tournamentsTable.isClanTournament, true), eq(tournamentsTable.tournamentType, "team")));

  let scope = clanTournaments;
  if (tournamentId !== null) scope = clanTournaments.filter((t) => t.id === tournamentId);
  else if (seasonId !== null) scope = clanTournaments.filter((t) => t.seasonId === seasonId);

  const tournamentIds = scope.map((t) => t.id);
  if (tournamentIds.length === 0) return res.json([]);

  // 2. Every clan enrolled in those tournaments.
  const participantRows = await db
    .select({ teamId: tournamentParticipantsTable.teamId })
    .from(tournamentParticipantsTable)
    .where(inArray(tournamentParticipantsTable.tournamentId, tournamentIds));
  const teamIds = [
    ...new Set(participantRows.map((r) => r.teamId).filter((id): id is number => id != null)),
  ];
  if (teamIds.length === 0) return res.json([]);

  // 3. The clans themselves + their squad sizes.
  const teamRows = await db
    .select({ id: teamsTable.id, name: teamsTable.name, tag: teamsTable.tag, logoUrl: teamsTable.logoUrl })
    .from(teamsTable)
    .where(inArray(teamsTable.id, teamIds));

  const memberRows = await db
    .select({ teamId: playersTable.teamId })
    .from(playersTable)
    .where(inArray(playersTable.teamId, teamIds));
  const memberCounts = new Map<number, number>();
  for (const m of memberRows) {
    if (m.teamId != null) memberCounts.set(m.teamId, (memberCounts.get(m.teamId) ?? 0) + 1);
  }

  // 4. Completed fixtures in scope, oldest → newest so `form` reads chronologically.
  const completedMatches = await db
    .select({
      participant1Id: matchesTable.participant1Id,
      participant2Id: matchesTable.participant2Id,
      participant1Score: matchesTable.participant1Score,
      participant2Score: matchesTable.participant2Score,
    })
    .from(matchesTable)
    .where(and(inArray(matchesTable.tournamentId, tournamentIds), eq(matchesTable.status, "completed")))
    .orderBy(matchesTable.scheduledAt, matchesTable.id);

  interface TableRow {
    played: number;
    won: number;
    drawn: number;
    lost: number;
    goalsFor: number;
    goalsAgainst: number;
    points: number;
    form: ResultLetter[];
  }
  const emptyRow = (): TableRow => ({
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    points: 0,
    form: [],
  });
  const table = new Map<number, TableRow>();
  const rowFor = (id: number): TableRow => {
    let row = table.get(id);
    if (!row) {
      row = emptyRow();
      table.set(id, row);
    }
    return row;
  };
  const enrolled = new Set(teamIds);

  for (const m of completedMatches) {
    const t1 = m.participant1Id;
    const t2 = m.participant2Id;
    const s1 = m.participant1Score;
    const s2 = m.participant2Score;
    if (t1 == null || t2 == null || s1 == null || s2 == null) continue;
    if (!enrolled.has(t1) || !enrolled.has(t2)) continue;

    const home = rowFor(t1);
    const away = rowFor(t2);
    home.played += 1;
    away.played += 1;
    home.goalsFor += s1;
    home.goalsAgainst += s2;
    away.goalsFor += s2;
    away.goalsAgainst += s1;

    if (s1 > s2) {
      home.won += 1;
      home.points += 3;
      away.lost += 1;
      home.form.push("W");
      away.form.push("L");
    } else if (s1 < s2) {
      away.won += 1;
      away.points += 3;
      home.lost += 1;
      away.form.push("W");
      home.form.push("L");
    } else {
      home.drawn += 1;
      away.drawn += 1;
      home.points += 1;
      away.points += 1;
      home.form.push("D");
      away.form.push("D");
    }
  }

  const standings = teamRows
    .map((team) => {
      const row = table.get(team.id) ?? emptyRow();
      const goalDifference = row.goalsFor - row.goalsAgainst;
      return {
        id: team.id,
        name: team.name,
        tag: team.tag,
        logoUrl: team.logoUrl,
        played: row.played,
        wins: row.won,
        losses: row.lost,
        draws: row.drawn,
        points: row.points,
        goalsFor: row.goalsFor,
        goalsAgainst: row.goalsAgainst,
        goalDifference,
        plusMinus: goalDifference,
        form: row.form.slice(-5),
        memberCount: memberCounts.get(team.id) ?? 0,
      };
    })
    .sort(
      (a, b) =>
        b.points - a.points ||
        b.goalDifference - a.goalDifference ||
        b.goalsFor - a.goalsFor ||
        a.name.localeCompare(b.name),
    )
    .map((row, index) => ({ rank: index + 1, ...row }));

  return res.json(standings);
});

/**
 * GET /clan-tournament/transfers — recent player movement (clan transfers).
 * Newest first; ?limit= (default 50, capped at 200). `from` is null for a free
 * agent joining a clan for the first time.
 */
router.get("/clan-tournament/transfers", async (req, res) => {
  const requested = toIntOrNull(req.query.limit);
  const limit = Math.min(Math.max(requested ?? 50, 1), 200);

  const fromTeam = aliasedTable(teamsTable, "transfer_from_team");
  const toTeam = aliasedTable(teamsTable, "transfer_to_team");

  const rows = await db
    .select({
      id: playerTransfersTable.id,
      playerId: playerTransfersTable.playerId,
      playerName: playersTable.displayName,
      username: playersTable.username,
      avatarUrl: playersTable.avatarUrl,
      fromTeamId: playerTransfersTable.fromTeamId,
      fromTeamName: fromTeam.name,
      fromTeamTag: fromTeam.tag,
      toTeamId: playerTransfersTable.toTeamId,
      toTeamName: toTeam.name,
      toTeamTag: toTeam.tag,
      transferredAt: playerTransfersTable.transferredAt,
    })
    .from(playerTransfersTable)
    .innerJoin(playersTable, eq(playersTable.id, playerTransfersTable.playerId))
    .leftJoin(fromTeam, eq(fromTeam.id, playerTransfersTable.fromTeamId))
    .leftJoin(toTeam, eq(toTeam.id, playerTransfersTable.toTeamId))
    .orderBy(desc(playerTransfersTable.transferredAt))
    .limit(limit);

  return res.json(rows);
});

export default router;

