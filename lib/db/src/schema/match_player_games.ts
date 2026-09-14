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
  // Per-player match stats (entered by the admin alongside the score).
  // Possession is stored as a whole percentage per player (0–100); the pair
  // normally sums to 100 but is not enforced so admins can note overtime etc.
  homePossession: integer("home_possession"),
  awayPossession: integer("away_possession"),
  homeShots: integer("home_shots"),
  awayShots: integer("away_shots"),
  homeShotsOnTarget: integer("home_shots_on_target"),
  awayShotsOnTarget: integer("away_shots_on_target"),
  homeCorners: integer("home_corners"),
  awayCorners: integer("away_corners"),
  homeYellowCards: integer("home_yellow_cards"),
  awayYellowCards: integer("away_yellow_cards"),
  homeRedCards: integer("home_red_cards"),
  awayRedCards: integer("away_red_cards"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type MatchPlayerGame = typeof matchPlayerGamesTable.$inferSelect;
export type InsertMatchPlayerGame = typeof matchPlayerGamesTable.$inferInsert;
