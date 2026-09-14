/**
 * Shared domain types for the Waryaa Tournament & Fixtures Dashboard.
 */

export type MatchStatus = "LIVE" | "UPCOMING" | "COMPLETED";

export interface Team {
  id: string;
  name: string;
  /** Short tag used inside the emblem, e.g. "BM3". */
  tag: string;
  /** Neon accent used for the emblem glow / team identity. */
  color: string;
  seed?: number;
}

export interface MatchFixture {
  id: string;
  tournamentName: string;
  roundName?: string;
  homeTeam: Team;
  awayTeam: Team;
  scheduledTime: Date;
  status: MatchStatus;
  homeScore: number;
  awayScore: number;
}

export interface TopPlayer {
  rank: number;
  name: string;
  team: string;
  goals: number;
  avatarUrl?: string;
}

export interface LiveStream {
  id: string;
  title: string;
  channel: string;
  viewers: number;
  accent: string;
}

export interface TourneyCategory {
  id: string;
  label: string;
  /** Small descriptor chip, e.g. "Current", "Major", "National". */
  tag?: string;
  active?: boolean;
  archived?: boolean;
}