/**
 * Real fixture/clan data for the Waryaa tournament & fixtures dashboard.
 *
 * Mirrors the LIVE "clans" tournament (#39) — the upcoming card shown in the
 * design is Waryaa United vs Guardians FC, 14 SEPTEMBER 2026 · 13:03 EAT
 * (i.e. 2026-09-14T10:03Z), which is match id 612 in the database.
 */
import type { LiveStream, MatchFixture, TourneyCategory, TopPlayer } from "./types";

const CATEGORIES: TourneyCategory[] = [
  { id: "regional", label: "Regional Finals", tag: "Current", active: true },
  { id: "grand-slam", label: "Grand Slam", tag: "Major" },
  { id: "masters", label: "Masters", tag: "National" },
  { id: "seasonal", label: "Seasonal Leagues", tag: "Quarterly" },
  { id: "community", label: "Community Events" },
  { id: "junior", label: "Junior Tournaments" },
  { id: "archived", label: "Archived Events", archived: true },
];

// The 12 real clans from the "clans" tournament (#39), team ids 44–55.
const CLANS = {
  WY: { id: "44", name: "Waryaa United", tag: "WYU", color: "#00E676" },
  SH: { id: "45", name: "Somali Hawks", tag: "SMH", color: "#FF2A5F" },
  DS: { id: "46", name: "Desert Scorpions", tag: "DSC", color: "#FFB800" },
  BN: { id: "47", name: "Blue Nile FC", tag: "BNF", color: "#00F0FF" },
  GL: { id: "48", name: "Golden Lions", tag: "GDL", color: "#FFB800" },
  AK: { id: "49", name: "Aksum Kings", tag: "AKS", color: "#FF2A5F" },
  CE: { id: "50", name: "Crimson Eagles", tag: "CME", color: "#FF2A5F" },
  SS: { id: "51", name: "Sahara Storm", tag: "SHS", color: "#00F0FF" },
  NC: { id: "52", name: "Nile Crocodiles", tag: "NLC", color: "#00E676" },
  HW: { id: "53", name: "Highland Warriors", tag: "HLW", color: "#FFB800" },
  LH: { id: "54", name: "Lion Hearts", tag: "LNH", color: "#00F0FF" },
  GF: { id: "55", name: "Guardians FC", tag: "GRD", color: "#FF2A5F" },
} as const;

// The live upcoming fixture from the image → Waryaa United vs Guardians FC,
// 14 SEPTEMBER 2026 13:03 EAT (= 10:03Z). Match id 612 in the database.
const FIXTURES: MatchFixture[] = [
  {
    id: "612",
    tournamentName: "Regional Finals",
    roundName: "Round 1",
    homeTeam: { ...CLANS.WY },
    awayTeam: { ...CLANS.GF },
    scheduledTime: new Date("2026-09-14T13:03:00+03:00"),
    status: "UPCOMING",
    homeScore: 0,
    awayScore: 0,
  },
  {
    id: "636",
    tournamentName: "Regional Finals",
    roundName: "Round 5",
    homeTeam: { ...CLANS.WY },
    awayTeam: { ...CLANS.SS },
    scheduledTime: new Date("2026-08-27T20:00:00+03:00"),
    status: "COMPLETED",
    homeScore: 3,
    awayScore: 1,
  },
  {
    id: "642",
    tournamentName: "Regional Finals",
    roundName: "Round 6",
    homeTeam: { ...CLANS.WY },
    awayTeam: { ...CLANS.CE },
    scheduledTime: new Date("2026-08-27T22:30:00+03:00"),
    status: "COMPLETED",
    homeScore: 2,
    awayScore: 2,
  },
  {
    id: "648",
    tournamentName: "Grand Slam",
    roundName: "Round 7",
    homeTeam: { ...CLANS.WY },
    awayTeam: { ...CLANS.AK },
    scheduledTime: new Date("2026-09-14T19:00:00+03:00"),
    status: "UPCOMING",
    homeScore: 0,
    awayScore: 0,
  },
  {
    id: "668",
    tournamentName: "Grand Slam",
    roundName: "Round 10",
    homeTeam: { ...CLANS.GL },
    awayTeam: { ...CLANS.GF },
    scheduledTime: new Date("2026-09-14T21:00:00+03:00"),
    status: "UPCOMING",
    homeScore: 0,
    awayScore: 0,
  },
];

const TOP_PLAYERS: TopPlayer[] = [
  { rank: 1, name: "Warrior X7", team: "Guardians FC", goals: 245 },
  { rank: 2, name: "Ghost Rider", team: "Gliko Clans", goals: 229 },
  { rank: 3, name: "Silver Fox", team: "Desert Scorpions", goals: 211 },
  { rank: 4, name: "Black Mamba", team: "Waryaa United", goals: 205 },
];

const LIVE_STREAMS: LiveStream[] = [
  {
    id: "stream-1",
    title: "Regional Finals — Waryaa United matchday",
    channel: "Warrior X7",
    viewers: 92380,
    accent: "#FF2A5F",
  },
];

export const demo = {
  categories: CATEGORIES,
  fixtures: FIXTURES,
  topPlayers: TOP_PLAYERS,
  liveStreams: LIVE_STREAMS,
};
// Re-export the real clan roster so consumers can reference it.
export { CLANS };