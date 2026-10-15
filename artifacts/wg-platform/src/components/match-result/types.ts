/**
 * Dynamic data contracts for the Esports Match Result + Man of the Match UI.
 *
 * Every value is supplied by the caller (props / state / JSON) — the components
 * hard-code no teams, players, scores or ratings, so the exact same card renders
 * whatever fixture it is handed. See `sample-data.ts` for JSON-shaped examples
 * and `from-api.ts` to build this shape from live API rows.
 */

/** One side of the scoreboard (a clan/team). */
export interface MatchResultTeam {
  name: string;
  /** Clan crest; `null` renders a monogram fallback. */
  logoUrl: string | null;
  /** Fixture score for this side (duels won). */
  score: number;
  /** Goals scored by every player on this side, aggregated. */
  totalGoals: number;
}

/** A single player inside a 1-vs-1 duel. */
export interface MatchResultPlayer {
  name: string;
  /** Player portrait; `null` renders initials. */
  avatarUrl: string | null;
  goals: number;
  /** Drives the green highlight on the name and the score. */
  isWinner: boolean;
}

/** One player-vs-player duel of the fixture. */
export interface MatchResultDuel {
  playerA: MatchResultPlayer;
  playerB: MatchResultPlayer;
}

/** The opponent the MVP faced in his duel. */
export interface MatchResultDuelRival {
  name: string;
  avatarUrl: string | null;
  goals: number;
}

/** The rewarded player of the match. */
export interface MatchResultMotm {
  name: string;
  teamName: string;
  teamLogoUrl: string | null;
  avatarUrl: string | null;
  /** 0–10 rating, rendered as e.g. “10.0” by the rating badge. */
  rating: number;
  /** Goals the MVP scored in the duel. */
  goals: number;
  duelVsPlayer: MatchResultDuelRival;
  /** Share of the duel goals (0–100). `goalShare()` recomputes it for the bars. */
  goalPercentage: number;
  /** MVP goals + rival goals — the denominator of the progress bar. */
  totalDuelGoals: number;
}

/** Everything both views (match result → MOTM) need in order to render. */
export interface MatchResultData {
  tournamentName: string;
  round: string;
  matchNumber: number | string;
  teamA: MatchResultTeam;
  teamB: MatchResultTeam;
  individualScores: MatchResultDuel[];
  motm: MatchResultMotm;
  /** Toggles the “VERIFIED RESULT” badge (defaults to `true`). */
  verified?: boolean;
}
