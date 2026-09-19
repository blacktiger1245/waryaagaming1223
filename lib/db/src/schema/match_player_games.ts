import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";

export const matchPlayerGamesTable = pgTable("match_player_games", {
  id: serial("id").primaryKey(),
  matchId: integer("match_id").notNull(),
  homePlayerId: integer("home_player_id"),
  homePlayerName: text("home_player_name"),
  awayPlayerId: integer("away_player_id"),
  awayPlayerName: text("away_player_name"),
  homeScore: integer("home_score"),
  awayScore: integer("away_score"),
  status: text("status").notNull().default("scheduled"), // scheduled | completed
  // ── Player-vs-player match statistics (admin-confirmed from the screenshot) ──
  // Every value is a whole number. NULL always means "not detected / not
  // recorded" — the administrator fills it in before approval. Possession is a
  // whole percentage per player (0–100); the pair normally sums to 100 but is not
  // enforced so admins can note overtime etc.
  //
  // The legacy `home_position` / `away_position` pair was folded into
  // `home_possession` / `away_possession` by the statistics update (Position was
  // renamed to Possession) and the legacy `yellow_cards` / `red_cards` columns
  // became `offside` / `free_kicks`; see lib/db/src/migrate-match-results.mjs.
  homePossession: integer("home_possession"),
  awayPossession: integer("away_possession"),
  homeShots: integer("home_shots"),
  awayShots: integer("away_shots"),
  homeShotsOnTarget: integer("home_shots_on_target"),
  awayShotsOnTarget: integer("away_shots_on_target"),
  homeCornerKicks: integer("home_corner_kicks"),
  awayCornerKicks: integer("away_corner_kicks"),
  homeOffside: integer("home_offside"),
  awayOffside: integer("away_offside"),
  homeFreeKicks: integer("home_free_kicks"),
  awayFreeKicks: integer("away_free_kicks"),
  homeFouls: integer("home_fouls"),
  awayFouls: integer("away_fouls"),
  homeSuccessfulPasses: integer("home_successful_passes"),
  awaySuccessfulPasses: integer("away_successful_passes"),
  homeCrosses: integer("home_crosses"),
  awayCrosses: integer("away_crosses"),
  homeInterceptions: integer("home_interceptions"),
  awayInterceptions: integer("away_interceptions"),
  homeTackles: integer("home_tackles"),
  awayTackles: integer("away_tackles"),
  homeSaves: integer("home_saves"),
  awaySaves: integer("away_saves"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type MatchPlayerGame = typeof matchPlayerGamesTable.$inferSelect;
export type InsertMatchPlayerGame = typeof matchPlayerGamesTable.$inferInsert;
