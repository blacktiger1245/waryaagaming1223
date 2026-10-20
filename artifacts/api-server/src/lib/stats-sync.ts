import { db } from "@workspace/db";
import {
  playersTable,
  teamsTable,
  matchesTable,
  matchPlayerGamesTable,
  tournamentsTable,
  playerPoints,
  pointsToMarketValue,
} from "@workspace/db";
import { eq, and, or, isNull, isNotNull, inArray, desc } from "drizzle-orm";
/**
 * Canonical statistics synchronisation.
 *
 * A player's profile numbers (appearances, goals, clean sheets, MOTM, points and
 * market value) must be identical everywhere: player profile, rankings, team
 * squad lists and the player card. Both competition shapes therefore feed the
 * same recompute pass:
 *
 *   • Solo tournaments  → matches.participant1Id / participant2Id are PLAYER ids
 *   • Clan tournaments  → the fixture participants are TEAM ids, so each player's
 *                          numbers come from their match_player_games row
 *
 * MOTM is stored on the fixture (`matches.man_of_the_match_id`) and is always a
 * PLAYER id, regardless of the tournament type.
 */

function uniqueIds(ids: Array<number | null | undefined>): number[] {
  return Array.from(
    new Set(ids.filter((id): id is number => typeof id === "number" && Number.isInteger(id) && id > 0)),
  );
}

interface Tally {
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goals: number;
  conceded: number;
  cleanSheets: number;
  motm: number;
  yellowCards: number;
  redCards: number;
}

function emptyTally(): Tally {
  return { played: 0, wins: 0, draws: 0, losses: 0, goals: 0, conceded: 0, cleanSheets: 0, motm: 0, yellowCards: 0, redCards: 0 };
}

/** Recompute winner/loser of one result row from its scores when needed. */
function resultOf(my: number, opp: number, recordedWinnerId: number | null, teamId: number): "win" | "draw" | "loss" {
  if (recordedWinnerId != null) return recordedWinnerId === teamId ? "win" : "loss";
  if (my > opp) return "win";
  if (my < opp) return "loss";
  return "draw";
}

/**
 * Recompute the stored statistics of the given players from every completed
 * fixture they took part in (solo matches + clan player-vs-player games).
 * Updates the players table, then re-ranks the whole ladder by points.
 */
export async function recomputePlayerStats(
  playerIds: Array<number | null | undefined>,
  options: { rerank?: boolean } = {},
): Promise<void> {
  const ids = uniqueIds(playerIds);
  if (ids.length === 0) return;

  const tallies = new Map<number, Tally>();
  for (const id of ids) tallies.set(id, emptyTally());

  // ── 1. Solo tournament matches (participant columns hold player ids) ──────
  const soloRows = await db
    .select({
      participant1Id: matchesTable.participant1Id,
      participant2Id: matchesTable.participant2Id,
      participant1Score: matchesTable.participant1Score,
      participant2Score: matchesTable.participant2Score,
      winnerId: matchesTable.winnerId,
      participant1YellowCards: matchesTable.participant1YellowCards,
      participant1RedCards: matchesTable.participant1RedCards,
      participant2YellowCards: matchesTable.participant2YellowCards,
      participant2RedCards: matchesTable.participant2RedCards,
    })
    .from(matchesTable)
    .leftJoin(tournamentsTable, eq(matchesTable.tournamentId, tournamentsTable.id))
    .where(
      and(
        eq(matchesTable.status, "completed"),
        or(isNull(matchesTable.tournamentId), eq(tournamentsTable.tournamentType, "solo")),
        or(inArray(matchesTable.participant1Id, ids), inArray(matchesTable.participant2Id, ids)),
      ),
    );

  for (const m of soloRows) {
    for (const playerId of ids) {
      const asP1 = m.participant1Id === playerId;
      const asP2 = m.participant2Id === playerId;
      if (!asP1 && !asP2) continue;

      const tally = tallies.get(playerId)!;
      const my = (asP1 ? m.participant1Score : m.participant2Score) ?? 0;
      const opp = (asP1 ? m.participant2Score : m.participant1Score) ?? 0;

      tally.played++;
      tally.goals += my;
      tally.conceded += opp;
      if (opp === 0) tally.cleanSheets++;
      if (asP1) {
        tally.yellowCards += m.participant1YellowCards ?? 0;
        tally.redCards += m.participant1RedCards ?? 0;
      } else {
        tally.yellowCards += m.participant2YellowCards ?? 0;
        tally.redCards += m.participant2RedCards ?? 0;
      }

      const outcome = resultOf(my, opp, m.winnerId ?? null, playerId);
      if (outcome === "win") tally.wins++;
      else if (outcome === "draw") tally.draws++;
      else tally.losses++;
    }
  }


  // ── 2. Clan tournaments — player-vs-player games inside a fixture ─────────
  // A duel counts as soon as its own scoreline exists, even when other duels of
  // the same fixture are still pending, so profiles update immediately.
  const gameRows = await db
    .select({
      homePlayerId: matchPlayerGamesTable.homePlayerId,
      awayPlayerId: matchPlayerGamesTable.awayPlayerId,
      homeScore: matchPlayerGamesTable.homeScore,
      awayScore: matchPlayerGamesTable.awayScore,
    })
    .from(matchPlayerGamesTable)
    .innerJoin(matchesTable, eq(matchPlayerGamesTable.matchId, matchesTable.id))
    .innerJoin(tournamentsTable, eq(matchesTable.tournamentId, tournamentsTable.id))
    .where(
      and(
        eq(tournamentsTable.tournamentType, "team"),
        isNotNull(matchPlayerGamesTable.homeScore),
        isNotNull(matchPlayerGamesTable.awayScore),
        or(
          inArray(matchPlayerGamesTable.homePlayerId, ids),
          inArray(matchPlayerGamesTable.awayPlayerId, ids),
        ),
      ),
    );

  for (const g of gameRows) {
    for (const playerId of ids) {
      const isHome = g.homePlayerId === playerId;
      const isAway = g.awayPlayerId === playerId;
      if (!isHome && !isAway) continue;

      const tally = tallies.get(playerId)!;
      const my = (isHome ? g.homeScore : g.awayScore) ?? 0;
      const opp = (isHome ? g.awayScore : g.homeScore) ?? 0;

      tally.played++;
      tally.goals += my;
      tally.conceded += opp;
      if (opp === 0) tally.cleanSheets++;
      if (my > opp) tally.wins++;
      else if (my === opp) tally.draws++;
      else tally.losses++;
    }
  }

  // ── 3. Man of the Match (one award per completed fixture) ────────────────
  const motmRows = await db
    .select({ manOfTheMatchId: matchesTable.manOfTheMatchId })
    .from(matchesTable)
    .where(and(eq(matchesTable.status, "completed"), inArray(matchesTable.manOfTheMatchId, ids)));

  for (const row of motmRows) {
    if (row.manOfTheMatchId == null) continue;
    const tally = tallies.get(row.manOfTheMatchId);
    if (tally) tally.motm++;
  }


  // ── 4. Persist the recomputed numbers ────────────────────────────────────
  for (const playerId of ids) {
    const tally = tallies.get(playerId)!;
    const [existing] = await db
      .select({ tournamentWins: playersTable.tournamentWins })
      .from(playersTable)
      .where(eq(playersTable.id, playerId));
    if (!existing) continue;

    const matchesLost = Math.max(0, tally.played - tally.wins - tally.draws);
    const points = playerPoints({
      appearances: tally.played,
      wins: tally.wins,
      cleanSheets: tally.cleanSheets,
      goals: tally.goals,
      motm: tally.motm,
      draws: tally.draws,
    });

    await db
      .update(playersTable)
      .set({
        points,
        marketValue: pointsToMarketValue(points),
        matchesPlayed: tally.played,
        matchesWon: tally.wins,
        matchesLost,
        draws: tally.draws,
        goalsScored: tally.goals,
        goalsConceded: tally.conceded,
        cleanSheets: tally.cleanSheets,
        manOfTheMatch: tally.motm,
        yellowCards: tally.yellowCards,
        redCards: tally.redCards,
        winRate: tally.wins * 0.4,
        lossRate: matchesLost * 0.4,
        tournamentWins: existing.tournamentWins ?? 0,
      })
      .where(eq(playersTable.id, playerId));
  }

  if (options.rerank !== false) await rerankPlayers();
}

/** Recompute the ladder positions (1 = best) from the stored points. */
export async function rerankPlayers(): Promise<void> {
  const all = await db
    .select({ id: playersTable.id, points: playersTable.points, rank: playersTable.rank })
    .from(playersTable)
    .orderBy(desc(playersTable.points), playersTable.id);

  await Promise.all(
    all.map((p, i) =>
      db
        .update(playersTable)
        .set({ previousRank: p.rank > 0 && p.rank < 9999 ? p.rank : i + 1, rank: i + 1 })
        .where(eq(playersTable.id, p.id)),
    ),
  );
}

/**
 * Recompute a clan's win/loss/points record from its completed clan-tournament
 * fixtures so the team profile and clan rankings always match the results.
 */
export async function recalculateTeamStats(teamIds: Array<number | null | undefined>): Promise<void> {
  const ids = uniqueIds(teamIds);
  if (ids.length === 0) return;

  const rows = await db
    .select({
      participant1Id: matchesTable.participant1Id,
      participant2Id: matchesTable.participant2Id,
      participant1Score: matchesTable.participant1Score,
      participant2Score: matchesTable.participant2Score,
      winnerId: matchesTable.winnerId,
    })
    .from(matchesTable)
    .innerJoin(tournamentsTable, eq(tournamentsTable.id, matchesTable.tournamentId))
    .where(
      and(
        eq(matchesTable.status, "completed"),
        eq(tournamentsTable.tournamentType, "team"),
        or(inArray(matchesTable.participant1Id, ids), inArray(matchesTable.participant2Id, ids)),
      ),
    );

  for (const teamId of ids) {
    let wins = 0;
    let losses = 0;
    let draws = 0;

    for (const m of rows) {
      const isHome = m.participant1Id === teamId;
      const isAway = m.participant2Id === teamId;
      if (!isHome && !isAway) continue;

      const my = (isHome ? m.participant1Score : m.participant2Score) ?? 0;
      const opp = (isHome ? m.participant2Score : m.participant1Score) ?? 0;
      const outcome = resultOf(my, opp, m.winnerId ?? null, teamId);
      if (outcome === "win") wins++;
      else if (outcome === "draw") draws++;
      else losses++;
    }

    await db
      .update(teamsTable)
      .set({ wins, losses, points: wins * 3 + draws })
      .where(eq(teamsTable.id, teamId));
  }
}

/**
 * Sync every stat that depends on one fixture after it was created/edited:
 * clan records for team matches, plus the involved players' profiles.
 */
export async function syncStatsAfterFixture(
  match: typeof matchesTable.$inferSelect,
): Promise<void> {
  // Always recompute: when a fixture is reopened or corrected its numbers simply
  // drop out of the totals, because only completed results are counted.
  const [tournament] = match.tournamentId
    ? await db
        .select({ tournamentType: tournamentsTable.tournamentType })
        .from(tournamentsTable)
        .where(eq(tournamentsTable.id, match.tournamentId))
    : [null];

  const isTeamMatch = tournament?.tournamentType === "team";

  if (!isTeamMatch) {
    await recomputePlayerStats([match.participant1Id, match.participant2Id, match.manOfTheMatchId]);
    return;
  }

  // Clan fixture: credit the players who actually played a duel and the MOTM.
  const games = await db
    .select({
      homePlayerId: matchPlayerGamesTable.homePlayerId,
      awayPlayerId: matchPlayerGamesTable.awayPlayerId,
    })
    .from(matchPlayerGamesTable)
    .where(eq(matchPlayerGamesTable.matchId, match.id));

  const playerIds = games.flatMap((g) => [g.homePlayerId, g.awayPlayerId]);
  await recomputePlayerStats([...playerIds, match.manOfTheMatchId]);
  await recalculateTeamStats([match.participant1Id, match.participant2Id]);
}

/**
 * Older/manual player pairings only stored a display name. Link them to the
 * matching player profile so their goals/appearances/MOTM reach the profile and
 * the rankings. Runs as part of the boot refresh.
 */
export async function backfillPlayerGameIds(): Promise<number> {
  const rows = await db
    .select({
      id: matchPlayerGamesTable.id,
      homePlayerId: matchPlayerGamesTable.homePlayerId,
      homePlayerName: matchPlayerGamesTable.homePlayerName,
      awayPlayerId: matchPlayerGamesTable.awayPlayerId,
      awayPlayerName: matchPlayerGamesTable.awayPlayerName,
    })
    .from(matchPlayerGamesTable)
    .where(or(isNull(matchPlayerGamesTable.homePlayerId), isNull(matchPlayerGamesTable.awayPlayerId)));

  if (rows.length === 0) return 0;

  const names = new Set<string>();
  for (const row of rows) {
    if (row.homePlayerId == null && row.homePlayerName) names.add(row.homePlayerName);
    if (row.awayPlayerId == null && row.awayPlayerName) names.add(row.awayPlayerName);
  }
  if (names.size === 0) return 0;

  const list = Array.from(names);
  const players = await db
    .select({ id: playersTable.id, displayName: playersTable.displayName, username: playersTable.username })
    .from(playersTable)
    .where(or(inArray(playersTable.displayName, list), inArray(playersTable.username, list)));

  const idByName = new Map<string, number>();
  for (const p of players) {
    if (p.displayName) idByName.set(p.displayName, p.id);
    if (p.username) idByName.set(p.username, p.id);
  }

  let updated = 0;
  for (const row of rows) {
    const patch: { homePlayerId?: number; awayPlayerId?: number } = {};
    if (row.homePlayerId == null && row.homePlayerName) {
      const found = idByName.get(row.homePlayerName);
      if (found) patch.homePlayerId = found;
    }
    if (row.awayPlayerId == null && row.awayPlayerName) {
      const found = idByName.get(row.awayPlayerName);
      if (found) patch.awayPlayerId = found;
    }
    if (Object.keys(patch).length > 0) {
      await db.update(matchPlayerGamesTable).set(patch).where(eq(matchPlayerGamesTable.id, row.id));
      updated++;
    }
  }
  return updated;
}

/**
 * Rebuild every player's and clan's derived statistics from all completed
 * results. Run once at boot (and available through the admin endpoint) so
 * profiles/rankings self-heal after result imports, edits or legacy data.
 */
export async function refreshAllStats(): Promise<{ players: number; teams: number; linkedGames: number }> {
  const linkedGames = await backfillPlayerGameIds();

  const players = await db.select({ id: playersTable.id }).from(playersTable);
  const CHUNK = 100;
  for (let i = 0; i < players.length; i += CHUNK) {
    await recomputePlayerStats(
      players.slice(i, i + CHUNK).map((p) => p.id),
      { rerank: false },
    );
  }
  await rerankPlayers();

  const teams = await db.select({ id: teamsTable.id }).from(teamsTable);
  await recalculateTeamStats(teams.map((t) => t.id));

  return { players: players.length, teams: teams.length, linkedGames };
}
