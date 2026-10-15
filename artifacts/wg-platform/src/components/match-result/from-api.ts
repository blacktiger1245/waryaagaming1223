import type { MatchResultData, MatchResultDuel, MatchResultMotm, MatchResultPlayer } from "./types";

/** A fixture row as returned by `GET /api/tournaments/:id/matches`. */
export interface MatchResultApiFixture {
  tournamentName?: string | null;
  roundName?: string | null;
  round?: number | null;
  participant1Id?: number | null;
  participant1Name?: string | null;
  participant1Score?: number | null;
  participant2Id?: number | null;
  participant2Name?: string | null;
  participant2Score?: number | null;
  manOfTheMatchId?: number | null;
  manOfTheMatchName?: string | null;
}

/** A player-vs-player row as returned by `GET /api/matches/:id/player-games`. */
export interface MatchResultApiPlayerGame {
  homePlayerId?: number | null;
  homePlayerName?: string | null;
  homeScore?: number | null;
  awayPlayerId?: number | null;
  awayPlayerName?: string | null;
  awayScore?: number | null;
}

export interface BuildMatchResultOptions {
  fixture: MatchResultApiFixture;
  playerGames: MatchResultApiPlayerGame[];
  /** team id → clan crest URL. */
  teamLogoMap?: Map<number, string | null>;
  /** player id → avatar URL. */
  playerAvatarMap?: Map<number, string | null>;
  /** Position of the fixture on its matchday (defaults to 1). */
  matchNumber?: number | string;
  /** The API stores no rating yet — this is the value the rating badge shows. */
  motmRating?: number;
  /** Pick the top scorer as MVP when the fixture has no `manOfTheMatchId`. */
  deriveMotmWhenMissing?: boolean;
}

function sum(values: Array<number | null | undefined>): number {
  return values.reduce<number>((total, value) => total + (value ?? 0), 0);
}

/**
 * Maps live API rows onto the props the match-result / MOTM UI expects, so a real
 * fixture can be rendered without touching the components.
 *
 * Returns `null` when the fixture has no participants, or when it has no player
 * of the match and `deriveMotmWhenMissing` is not enabled — the caller then
 * decides what to show instead.
 */
export function buildMatchResultData(options: BuildMatchResultOptions): MatchResultData | null {
  const {
    fixture,
    playerGames,
    teamLogoMap,
    playerAvatarMap,
    matchNumber = 1,
    motmRating = 10,
    deriveMotmWhenMissing = false,
  } = options;

  const teamAName = fixture.participant1Name ?? null;
  const teamBName = fixture.participant2Name ?? null;
  if (!teamAName && !teamBName) return null;

  const avatarOf = (id?: number | null) =>
    id != null && playerAvatarMap ? playerAvatarMap.get(id) ?? null : null;
  const crestOf = (id?: number | null) =>
    id != null && teamLogoMap ? teamLogoMap.get(id) ?? null : null;

  const player = (
    id: number | null | undefined,
    name: string | null | undefined,
    goals: number | null | undefined,
    oppGoals: number | null | undefined,
  ): MatchResultPlayer => ({
    name: name ?? "Unknown player",
    avatarUrl: avatarOf(id ?? null),
    goals: goals ?? 0,
    isWinner: (goals ?? 0) > (oppGoals ?? 0),
  });

  const individualScores: MatchResultDuel[] = playerGames.map((game) => ({
    playerA: player(game.homePlayerId, game.homePlayerName, game.homeScore, game.awayScore),
    playerB: player(game.awayPlayerId, game.awayPlayerName, game.awayScore, game.homeScore),
  }));

  // ── Locate the MVP ─────────────────────────────────────────────────────────
  let motmId = fixture.manOfTheMatchId ?? null;
  if (motmId == null && deriveMotmWhenMissing) {
    const scorers = new Map<number, { id: number; name: string; goals: number }>();
    for (const game of playerGames) {
      if (game.homePlayerId != null) {
        const entry = scorers.get(game.homePlayerId) ?? { id: game.homePlayerId, name: game.homePlayerName ?? "", goals: 0 };
        entry.goals += game.homeScore ?? 0;
        scorers.set(game.homePlayerId, entry);
      }
      if (game.awayPlayerId != null) {
        const entry = scorers.get(game.awayPlayerId) ?? { id: game.awayPlayerId, name: game.awayPlayerName ?? "", goals: 0 };
        entry.goals += game.awayScore ?? 0;
        scorers.set(game.awayPlayerId, entry);
      }
    }
    const best = [...scorers.values()].sort((a, b) => b.goals - a.goals)[0];
    motmId = best?.id ?? null;
  }
  if (motmId == null) return null;

  // Every game the MVP played — his goals are summed, and the rival is the
  // opponent he faced in the game he scored the most in.
  const mvpGames = playerGames
    .map((game) => {
      const isHome = game.homePlayerId === motmId;
      const isAway = game.awayPlayerId === motmId;
      if (!isHome && !isAway) return null;
      return {
        isHome,
        goals: (isHome ? game.homeScore : game.awayScore) ?? 0,
        rivalId: (isHome ? game.awayPlayerId : game.homePlayerId) ?? null,
        rivalName: (isHome ? game.awayPlayerName : game.homePlayerName) ?? "",
        rivalGoals: (isHome ? game.awayScore : game.homeScore) ?? 0,
        playerName: (isHome ? game.homePlayerName : game.awayPlayerName) ?? "",
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  if (mvpGames.length === 0) return null;

  const motmGoals = sum(mvpGames.map((game) => game.goals));
  const decisiveGame = mvpGames.reduce((best, game) => (game.goals > best.goals ? game : best), mvpGames[0]);
  const totalDuelGoals = motmGoals + decisiveGame.rivalGoals;

  const motm: MatchResultMotm = {
    name: fixture.manOfTheMatchName || decisiveGame.playerName || "Man of the Match",
    teamName: decisiveGame.isHome ? teamAName ?? "" : teamBName ?? "",
    teamLogoUrl: crestOf(decisiveGame.isHome ? fixture.participant1Id : fixture.participant2Id),
    avatarUrl: avatarOf(motmId),
    rating: motmRating,
    goals: motmGoals,
    duelVsPlayer: {
      name: decisiveGame.rivalName || "Opponent",
      avatarUrl: avatarOf(decisiveGame.rivalId),
      goals: decisiveGame.rivalGoals,
    },
    goalPercentage: totalDuelGoals > 0 ? Math.round((motmGoals / totalDuelGoals) * 100) : 0,
    totalDuelGoals,
  };

  return {
    tournamentName: fixture.tournamentName ?? "Waryaa Gaming",
    round: fixture.roundName ?? (fixture.round != null ? `Round ${fixture.round}` : "Fixture"),
    matchNumber,
    verified: true,
    teamA: {
      name: teamAName ?? "TBD",
      logoUrl: crestOf(fixture.participant1Id),
      score: fixture.participant1Score ?? 0,
      totalGoals: sum(playerGames.map((game) => game.homeScore)),
    },
    teamB: {
      name: teamBName ?? "TBD",
      logoUrl: crestOf(fixture.participant2Id),
      score: fixture.participant2Score ?? 0,
      totalGoals: sum(playerGames.map((game) => game.awayScore)),
    },
    individualScores,
    motm,
  };
}


