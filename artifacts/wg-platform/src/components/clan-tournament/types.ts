/**
 * Shared domain types for the Clan Tournament section (FotMob-style layout).
 */

export type FormResult = "W" | "D" | "L";

/** A single row in the clan standings table. */
export interface ClanStanding {
  id: number;
  rank: number;
  name: string;
  /** Short clan tag rendered inside the generated badge, e.g. "BM3". */
  tag: string;
  /** Uploaded crest. Falls back to a generated tag badge when absent. */
  logoUrl: string | null;
  /** Matches played. */
  played: number;
  won: number;
  drawn: number;
  lost: number;
  /** Signed "+/-" swing column. */
  plusMinus: number;
  /** Goal difference column. */
  goalDifference: number;
  points: number;
  /** Most recent results, oldest → newest. Padded with placeholders in the UI. */
  form: FormResult[];
  /** Upcoming opponent shown as a badge in the "Next" column. */
  nextOpponent: { name: string; tag: string; logoUrl: string | null } | null;
}

/**
 * The exact 4-3-3 slots the Team of the Week fills. The API returns the eleven
 * in strength order (#1 = best) and maps them onto the pitch as:
 * #1 → RW, #2 → ST, #3 → LW, #4-#6 → CM, #7 → RB, #8/#9 → CB, #10 → LB, #11 → GK.
 */
export type PitchPosition = "RW" | "ST" | "LW" | "CM" | "RB" | "CB" | "LB" | "GK";

/** Which pitch row a slot sits on, top (attack) → bottom (goal). */
export const PITCH_ROW_OF: Record<PitchPosition, 0 | 1 | 2 | 3> = {
  RW: 0,
  ST: 0,
  LW: 0,
  CM: 1,
  RB: 2,
  CB: 2,
  LB: 2,
  GK: 3,
};

/** Row labels, top → bottom, matching PITCH_ROW_OF. */
export const PITCH_ROW_LABEL = ["Attack", "Midfield", "Defence", "Goalkeeper"] as const;

/** One player node placed on the Team of the Week pitch. */
export interface PitchPlayer extends TopScorePlayer {
  /** `playerId` as a string — a stable React key for the pitch node. */
  id: string;
  position: PitchPosition;
  /** The best-ranked player of the week. */
  starred: boolean;
}

/** One row of the tournament Top Scores table (real tournament statistics). */
export interface TopScorePlayer {
  /** 1-based position in the ranking. */
  rank: number;
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
  /** Overall performance rating for the scope (0–10). */
  performance: number;
}

/** One tournament week (round) that statistics are available for. */
export interface ClanWeekOption {
  round: number;
  label: string;
  roundName: string | null;
  fixtures: number;
  completedFixtures: number;
  playedMatchups: number;
  /** True when every fixture in the week is completed. */
  isComplete: boolean;
}

export type ClanTournamentTabId =
  | "overview"
  | "table"
  | "fixtures"
  | "player-stats"
  | "team-stats"
  | "transfers"
  | "seasons"
  | "news";
