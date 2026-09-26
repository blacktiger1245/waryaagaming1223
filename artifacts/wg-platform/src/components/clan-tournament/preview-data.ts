/**
 * Preview dataset for the Clan Tournament section.
 *
 * There is currently NO backend endpoint that returns per-player match ratings,
 * so the Team of the Week widget has no live source. These samples let the
 * section render its full layout (and let the design be reviewed) until a
 * ratings feed exists. The page only uses them when the live API returns no
 * rows, and shows a "Preview data" chip whenever it does.
 */
import type { ClanStanding, PitchPlayer } from "./types";

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

/** One 4-3-3 line-up (GK 1 · DEF 4 · MID 3 · FWD 3). */
export const PREVIEW_TEAM_OF_THE_WEEK: PitchPlayer[] = [
  { id: "f1", name: "A. Warsame", position: "FWD", rating: 9.7, avatarUrl: null, starred: true },
  { id: "f2", name: "M. Cabdi", position: "FWD", rating: 8.3, avatarUrl: null, starred: false },
  { id: "f3", name: "Y. Nuur", position: "FWD", rating: 8.1, avatarUrl: null, starred: false },
  { id: "m1", name: "H. Faarax", position: "MID", rating: 8.7, avatarUrl: null, starred: false },
  { id: "m2", name: "S. Xasan", position: "MID", rating: 8.0, avatarUrl: null, starred: false },
  { id: "m3", name: "B. Cali", position: "MID", rating: 7.8, avatarUrl: null, starred: false },
  { id: "d1", name: "I. Yuusuf", position: "DEF", rating: 8.2, avatarUrl: null, starred: false },
  { id: "d2", name: "K. Maxamed", position: "DEF", rating: 7.9, avatarUrl: null, starred: false },
  { id: "d3", name: "N. Guuleed", position: "DEF", rating: 7.7, avatarUrl: null, starred: false },
  { id: "d4", name: "F. Cismaan", position: "DEF", rating: 7.5, avatarUrl: null, starred: false },
  { id: "g1", name: "O. Aadan", position: "GK", rating: 8.4, avatarUrl: null, starred: false },
];
