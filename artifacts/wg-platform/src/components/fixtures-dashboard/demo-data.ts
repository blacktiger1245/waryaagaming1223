/**
 * Sample data for the tournament & fixtures dashboard design preview.
 * Represents the "Regional Finals" tournament context.
 */
import type {
  LiveStream,
  MatchFixture,
  TourneyCategory,
  TopPlayer,
} from "./types";

const CATEGORIES: TourneyCategory[] = [
  { id: "regional", label: "Regional Finals", tag: "Current", active: true },
  { id: "grand-slam", label: "Grand Slam", tag: "Major" },
  { id: "masters", label: "Masters", tag: "National" },
  { id: "seasonal", label: "Seasonal Leagues", tag: "Quarterly" },
  { id: "community", label: "Community Events" },
  { id: "junior", label: "Junior Tournaments" },
  { id: "archived", label: "Archived Events", archived: true },
];

const FIXTURES: MatchFixture[] = [
  {
    id: "f1",
    tournamentName: "Regional Finals",
    roundName: "Finals",
    homeTeam: { id: "t-black-mamba", name: "Black Mamba 3", tag: "BM3", color: "#00F0FF", seed: 1 },
    awayTeam: { id: "t-lightning", name: "Lightning Bolt 4", tag: "LB4", color: "#FFB800", seed: 2 },
    scheduledTime: new Date("2026-08-27T13:03:00"),
    status: "LIVE",
    homeScore: 0,
    awayScore: 0,
  },
  {
    id: "f2",
    tournamentName: "Regional Finals",
    roundName: "Finals",
    homeTeam: { id: "t-united", name: "Waryaa United", tag: "WYU", color: "#00E676", seed: 1 },
    awayTeam: { id: "t-hawks", name: "Somali Hawks", tag: "SMH", color: "#FF2A5F", seed: 4 },
    scheduledTime: new Date("2026-08-27T20:00:00"),
    status: "UPCOMING",
    homeScore: 0,
    awayScore: 0,
  },
  {
    id: "f3",
    tournamentName: "Regional Finals",
    roundName: "Semi Final",
    homeTeam: { id: "t-scorpions", name: "Desert Scorpions", tag: "DSC", color: "#FFB800" },
    awayTeam: { id: "t-ghost", name: "Ghost Riders", tag: "GHR", color: "#00F0FF" },
    scheduledTime: new Date("2026-08-27T22:30:00"),
    status: "COMPLETED",
    homeScore: 3,
    awayScore: 1,
  },
  {
    id: "f4",
    tournamentName: "Grand Slam",
    roundName: "Round 1",
    homeTeam: { id: "t-kings", name: "Aksum Kings", tag: "AKK", color: "#FF2A5F" },
    awayTeam: { id: "t-lions", name: "Golden Lions", tag: "GOL", color: "#FFB800" },
    scheduledTime: new Date("2026-09-14T13:03:00"),
    status: "UPCOMING",
    homeScore: 0,
    awayScore: 0,
  },
  {
    id: "f5",
    tournamentName: "Grand Slam",
    roundName: "Round 1",
    homeTeam: { id: "t-eagles", name: "Crimson Eagles", tag: "CME", color: "#FF2A5F" },
    awayTeam: { id: "t-storm", name: "Sahara Storm", tag: "SHS", color: "#00F0FF" },
    scheduledTime: new Date("2026-09-14T19:00:00"),
    status: "UPCOMING",
    homeScore: 0,
    awayScore: 0,
  },
];

const TOP_PLAYERS: TopPlayer[] = [
  { rank: 1, name: "Warrior X7", team: "Guardians FC", goals: 245 },
  { rank: 2, name: "Ghost Rider", team: "Ghost Riders", goals: 229 },
  { rank: 3, name: "Black Mamba", team: "Black Mamba 3", goals: 229 },
  { rank: 4, name: "Silver Fox", team: "Desert Scorpions", goals: 211 },
];

const LIVE_STREAMS: LiveStream[] = [
  {
    id: "stream-1",
    title: "Regional Finals — Finals",
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