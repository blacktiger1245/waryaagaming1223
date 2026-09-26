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

export type PitchPosition = "GK" | "DEF" | "MID" | "FWD";

/** One player node placed on the Team of the Week pitch. */
export interface PitchPlayer {
  id: string;
  name: string;
  position: PitchPosition;
  /** Match rating, e.g. 9.7. */
  rating: number;
  avatarUrl: string | null;
  /** Renders the rating badge with a star (man of the match). */
  starred: boolean;
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
