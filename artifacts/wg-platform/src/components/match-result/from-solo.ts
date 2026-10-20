import type { MatchResultData, MatchResultDuel } from "./types";

/** A solo (player-vs-player) fixture row from `GET /api/tournaments/:id/matches`. */
export interface SoloMatchResultInput {
  tournamentName?: string | null;
  roundName?: string | null;
  round?: number | null;
  /** In a solo fixture the participants are PLAYERS, not teams. */
  participant1Id?: number | null;
  participant1Name?: string | null;
  participant1Score?: number | null;
  participant2Id?: number | null;
  participant2Name?: string | null;
  participant2Score?: number | null;
  manOfTheMatchId?: number | null;
  manOfTheMatchName?: string | null;
}

export interface BuildSoloMatchResultOptions {
  match: SoloMatchResultInput;
  /** player id → avatar URL (participant ids are player ids in solo fixtures). */
  avatarMap?: Map<number, string | null>;
  matchNumber?: number | string;
  /** No rating is stored for solo fixtures yet — the badge shows this. */
  motmRating?: number;
  /**
   * Crown the higher scorer when the fixture has no `manOfTheMatchId`
   * (default `true`, so a finished solo fixture always has an MVP to show).
   */
  deriveMotmWhenMissing?: boolean;
}

function score(value: number | null | undefined): number {
  return value ?? 0;
}

/**
 * Maps a solo (player-vs-player) fixture onto the same `MatchResultData` the
 * Match Result + MOTM UI renders for clan fixtures, so both formats get the
 * identical result / MVP experience.
 *
 * In solo mode the two “sides” are the two players, the fixture score *is* their
 * duel score, and the two participants form the single duel row. `teamName` is
 * left empty on the MVP — the UI hides the clan line when there is no clan.
 */
export function buildSoloMatchResultData(options: BuildSoloMatchResultOptions): MatchResultData | null {
  const {
    match,
    avatarMap,
    matchNumber = 1,
    motmRating = 10,
    deriveMotmWhenMissing = true,
  } = options;

  const aName = match.participant1Name ?? null;
  const bName = match.participant2Name ?? null;
  if (!aName && !bName) return null;

  const aGoals = score(match.participant1Score);
  const bGoals = score(match.participant2Score);
  const aWins = aGoals > bGoals;
  const bWins = bGoals > aGoals;

  const avatarOf = (id?: number | null) =>
    id != null && avatarMap ? avatarMap.get(id) ?? null : null;

  // Which side is the MVP on? Fall back to the higher scorer when the fixture
  // has no man of the match recorded.
  let motmSide: "A" | "B" | null =
    match.manOfTheMatchId != null && match.manOfTheMatchId === match.participant1Id
      ? "A"
      : match.manOfTheMatchId != null && match.manOfTheMatchId === match.participant2Id
        ? "B"
        : null;
  if (motmSide == null) {
    if (!deriveMotmWhenMissing) return null;
    motmSide = bWins ? "B" : "A";
  }

  const isA = motmSide === "A";
  const motmGoals = isA ? aGoals : bGoals;
  const rivalGoals = isA ? bGoals : aGoals;
  const totalDuelGoals = motmGoals + rivalGoals;

  const duel: MatchResultDuel = {
    playerA: { name: aName ?? "Player A", avatarUrl: avatarOf(match.participant1Id), goals: aGoals, isWinner: aWins },
    playerB: { name: bName ?? "Player B", avatarUrl: avatarOf(match.participant2Id), goals: bGoals, isWinner: bWins },
  };

  return {
    tournamentName: match.tournamentName ?? "Waryaa Gaming",
    round: match.roundName ?? (match.round != null ? `Round ${match.round}` : "Fixture"),
    matchNumber,
    verified: true,
    teamA: {
      name: aName ?? "Player A",
      logoUrl: avatarOf(match.participant1Id),
      score: aGoals,
      totalGoals: aGoals,
    },
    teamB: {
      name: bName ?? "Player B",
      logoUrl: avatarOf(match.participant2Id),
      score: bGoals,
      totalGoals: bGoals,
    },
    // One duel = the fixture itself, so the duel list is the solo scoreline.
    individualScores: [duel],
    motm: {
      name: match.manOfTheMatchName || (isA ? aName : bName) || "Man of the Match",
      // Solo MVP has no clan — the UI hides the clan line when this is empty.
      teamName: "",
      teamLogoUrl: null,
      avatarUrl: avatarOf(isA ? match.participant1Id : match.participant2Id),
      rating: motmRating,
      goals: motmGoals,
      duelVsPlayer: {
        name: (isA ? bName : aName) || "Opponent",
        avatarUrl: avatarOf(isA ? match.participant2Id : match.participant1Id),
        goals: rivalGoals,
      },
      goalPercentage: totalDuelGoals > 0 ? Math.round((motmGoals / totalDuelGoals) * 100) : 0,
      totalDuelGoals,
    },
  };
}
