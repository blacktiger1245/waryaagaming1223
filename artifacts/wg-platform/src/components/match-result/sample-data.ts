import type { MatchResultData } from "./types";

/**
 * Two JSON-shaped example fixtures used by the demo page (`/match-result`).
 *
 * Nothing here is special-cased by the components — swap in any object that
 * satisfies `MatchResultData` (props, state, `fetch`, or a CMS payload) and the
 * card renders it as-is. Player portraits are `null` on purpose so the initials
 * fallback is exercised; real deployments pass avatar URLs.
 */
const CREST_A = `${import.meta.env.BASE_URL}waryaalogo-removebg-preview.png`;
const CREST_B = `${import.meta.env.BASE_URL}sff-logo.jpg`;

/** Final decided by 3–2, MVP took 63% of his duel goals. */
const GRAND_FINAL: MatchResultData = {
  tournamentName: "Waryaa Clan Cup 2026",
  round: "Grand Final",
  matchNumber: 1,
  verified: true,
  teamA: { name: "Hodan Warriors", logoUrl: CREST_A, score: 3, totalGoals: 9 },
  teamB: { name: "Shabelle United", logoUrl: CREST_B, score: 2, totalGoals: 7 },
  individualScores: [
    {
      playerA: { name: "Abdiqani Yusuf", avatarUrl: null, goals: 5, isWinner: true },
      playerB: { name: "Liban Ahmed", avatarUrl: null, goals: 3, isWinner: false },
    },
    {
      playerA: { name: "Farah Warsame", avatarUrl: null, goals: 2, isWinner: true },
      playerB: { name: "Hodan Ali", avatarUrl: null, goals: 1, isWinner: false },
    },
    {
      playerA: { name: "Mahad Nur", avatarUrl: null, goals: 1, isWinner: false },
      playerB: { name: "Yusuf Barre", avatarUrl: null, goals: 2, isWinner: true },
    },
    {
      playerA: { name: "Guled Osman", avatarUrl: null, goals: 0, isWinner: false },
      playerB: { name: "Kamal Sheikh", avatarUrl: null, goals: 1, isWinner: true },
    },
    {
      playerA: { name: "Bashir Aden", avatarUrl: null, goals: 1, isWinner: true },
      playerB: { name: "Abdul Rahman", avatarUrl: null, goals: 0, isWinner: false },
    },
  ],
  motm: {
    name: "Abdiqani Yusuf",
    teamName: "Hodan Warriors",
    teamLogoUrl: CREST_A,
    avatarUrl: null,
    rating: 10,
    goals: 5,
    duelVsPlayer: { name: "Liban Ahmed", avatarUrl: null, goals: 3 },
    goalPercentage: 63,
    totalDuelGoals: 8,
  },
};

/** League night decided by 3–1, with a drawn duel and a 80% MVP share. */
const MATCHDAY_7: MatchResultData = {
  tournamentName: "Somali Super League",
  round: "Matchday 7",
  matchNumber: 4,
  verified: true,
  teamA: { name: "Mogadishu Kings", logoUrl: CREST_B, score: 3, totalGoals: 10 },
  teamB: { name: "Kismayo Sharks", logoUrl: CREST_A, score: 1, totalGoals: 5 },
  individualScores: [
    {
      playerA: { name: "Ilyas Mohamed", avatarUrl: null, goals: 4, isWinner: true },
      playerB: { name: "Zakaria Farah", avatarUrl: null, goals: 1, isWinner: false },
    },
    {
      playerA: { name: "Ahmed Riyale", avatarUrl: null, goals: 3, isWinner: true },
      playerB: { name: "Said Omar", avatarUrl: null, goals: 2, isWinner: false },
    },
    {
      playerA: { name: "Omar Jama", avatarUrl: null, goals: 1, isWinner: false },
      playerB: { name: "Hassan Ali", avatarUrl: null, goals: 2, isWinner: true },
    },
    {
      playerA: { name: "Farhan Ali", avatarUrl: null, goals: 2, isWinner: true },
      playerB: { name: "Khalid Nur", avatarUrl: null, goals: 0, isWinner: false },
    },
    {
      playerA: { name: "Nasir Abdi", avatarUrl: null, goals: 0, isWinner: false },
      playerB: { name: "Abdi Samad", avatarUrl: null, goals: 0, isWinner: false },
    },
  ],
  motm: {
    name: "Ilyas Mohamed",
    teamName: "Mogadishu Kings",
    teamLogoUrl: CREST_B,
    avatarUrl: null,
    rating: 9.8,
    goals: 4,
    duelVsPlayer: { name: "Zakaria Farah", avatarUrl: null, goals: 1 },
    goalPercentage: 80,
    totalDuelGoals: 5,
  },
};

/** Solo player-vs-player fixture — one duel, and no clan line for the MVP. */
const SOLO_QUARTER_FINAL: MatchResultData = {
  tournamentName: "Somali Solo Championship",
  round: "Quarter Final",
  matchNumber: 2,
  verified: true,
  teamA: { name: "Ismail Warsame", logoUrl: null, score: 4, totalGoals: 4 },
  teamB: { name: "Deeq Hassan", logoUrl: null, score: 2, totalGoals: 2 },
  individualScores: [
    {
      playerA: { name: "Ismail Warsame", avatarUrl: null, goals: 4, isWinner: true },
      playerB: { name: "Deeq Hassan", avatarUrl: null, goals: 2, isWinner: false },
    },
  ],
  motm: {
    name: "Ismail Warsame",
    // No clan: the result card and the MVP hero hide the clan line entirely.
    teamName: "",
    teamLogoUrl: null,
    avatarUrl: null,
    rating: 9.6,
    goals: 4,
    duelVsPlayer: { name: "Deeq Hassan", avatarUrl: null, goals: 2 },
    goalPercentage: 67,
    totalDuelGoals: 6,
  },
};

/** Both team examples plus a solo one — the demo page switches between them. */
export const SAMPLE_MATCH_RESULTS: MatchResultData[] = [GRAND_FINAL, MATCHDAY_7, SOLO_QUARTER_FINAL];
