/**
 * Preview dataset for the Clan Tournament section.
 *
 * Sample STANDINGS only, shown when the live API returns no clan rows for the
 * unfiltered "All time" view (the page shows a "Preview data" chip whenever it
 * does). The Team of the Week has NO preview: it is always the real best XI
 * computed from the tournament statistics.
 */
import type { ClanStanding } from "./types";

export const PREVIEW_STANDINGS: ClanStanding[] = [
  {
    id: -1,
    rank: 1,
    name: "Mogadishu United",
    tag: "MGU",
    logoUrl: null,
    played: 12,
    won: 9,
    drawn: 2,
    lost: 1,
    plusMinus: 14,
    goalDifference: 14,
    points: 29,
    form: ["W", "W", "D", "W", "W"],
    nextOpponent: { name: "Hargeisa City", tag: "HRC", logoUrl: null },
  },
  {
    id: -2,
    rank: 2,
    name: "Hargeisa City",
    tag: "HRC",
    logoUrl: null,
    played: 12,
    won: 8,
    drawn: 2,
    lost: 2,
    plusMinus: 10,
    goalDifference: 10,
    points: 26,
    form: ["W", "L", "W", "W", "D"],
    nextOpponent: { name: "Kismayo FC", tag: "KSM", logoUrl: null },
  },
  {
    id: -3,
    rank: 3,
    name: "Kismayo FC",
    tag: "KSM",
    logoUrl: null,
    played: 12,
    won: 7,
    drawn: 3,
    lost: 2,
    plusMinus: 7,
    goalDifference: 7,
    points: 24,
    form: ["D", "W", "W", "L", "W"],
    nextOpponent: { name: "Bosaso Rovers", tag: "BSR", logoUrl: null },
  },
  {
    id: -4,
    rank: 4,
    name: "Bosaso Rovers",
    tag: "BSR",
    logoUrl: null,
    played: 12,
    won: 5,
    drawn: 4,
    lost: 3,
    plusMinus: 2,
    goalDifference: 2,
    points: 19,
    form: ["L", "D", "W", "D", "W"],
    nextOpponent: { name: "Baydhabo Stars", tag: "BYS", logoUrl: null },
  },
  {
    id: -5,
    rank: 5,
    name: "Baydhabo Stars",
    tag: "BYS",
    logoUrl: null,
    played: 12,
    won: 4,
    drawn: 3,
    lost: 5,
    plusMinus: -3,
    goalDifference: -3,
    points: 15,
    form: ["W", "L", "L", "D", "L"],
    nextOpponent: null,
  },
];

