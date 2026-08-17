// Player Points + Market Value (in-game coin value) — frontend mirror of the
// canonical rules in lib/db/src/player-stats.ts. Keep identical.
//
//   Points      are derived from the player's statistics ONLY.
//   Market Value is derived ONLY from TOTAL POINTS.
//   Losses, Decider Wins and Tournament Wins award 0 points.

export interface PlayerStatInput {
  appearances: number;
  wins: number;
  cleanSheets: number;
  goals: number;
  motm: number;
  draws: number;
}

export const PLAYER_POINT_RATES = {
  appearance: 5,
  win: 8,
  cleanSheet: 6,
  goal: 6,
  motm: 4,
  draw: 3,
} as const;

// TOTAL POINTS =
//   Appearances x 5 + Wins x 8 + Clean Sheets x 6
//   + Goals x 6 + MOTM x 4 + Draws x 3
export function playerPoints(stats: PlayerStatInput): number {
  return (
    stats.appearances * PLAYER_POINT_RATES.appearance +
    stats.wins * PLAYER_POINT_RATES.win +
    stats.cleanSheets * PLAYER_POINT_RATES.cleanSheet +
    stats.goals * PLAYER_POINT_RATES.goal +
    stats.motm * PLAYER_POINT_RATES.motm +
    stats.draws * PLAYER_POINT_RATES.draw
  );
}

// Market Value (in M coins) ranges keyed off TOTAL POINTS.
const MARKET_VALUE_RANGES: ReadonlyArray<readonly [number, number | null, number]> = [
  [0, 99, 5],
  [100, 249, 10],
  [250, 399, 20],
  [400, 549, 30],
  [550, 699, 50],
  [700, 849, 120],
  [850, 999, 140],
  [1000, 1199, 160],
  [1200, 1399, 180],
  [1400, 1599, 220],
  [1600, 1799, 270],
  [1800, 1999, 330],
  [2000, 2249, 400],
  [2250, 2499, 470],
  [2500, 2749, 540],
  [2750, 2999, 600],
  [3000, 3249, 640],
  [3250, 3499, 670],
  [3500, null, 700],
];

export function pointsToMarketValue(points: number): number {
  const p = Math.floor(Math.max(0, points || 0));
  for (const [lo, hi, value] of MARKET_VALUE_RANGES) {
    if (p >= lo && (hi === null || p <= hi)) return value;
  }
  return 700; // 3500+ points
}

export function marketValueLabel(marketValueM: number): string {
  return `${marketValueM}M`;
}

export function playerMarketValueM(stats: PlayerStatInput): number {
  return pointsToMarketValue(playerPoints(stats));
}
