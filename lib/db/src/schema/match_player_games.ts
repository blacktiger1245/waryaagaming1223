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
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type MatchPlayerGame = typeof matchPlayerGamesTable.$inferSelect;
export type InsertMatchPlayerGame = typeof matchPlayerGamesTable.$inferInsert;
