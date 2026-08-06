import { pgTable, serial, text, integer, boolean, timestamp, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const playersTable = pgTable("players", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  displayName: text("display_name"),
  avatarUrl: text("avatar_url"),
  email: text("email"),
  teamId: integer("team_id"),
  rank: integer("rank").notNull().default(9999),
  previousRank: integer("previous_rank").notNull().default(0),
  tournamentWins: integer("tournament_wins").notNull().default(0),
  winRate: real("win_rate").notNull().default(0),
  matchesPlayed: integer("matches_played").notNull().default(0),
  matchesWon: integer("matches_won").notNull().default(0),
  matchesLost: integer("matches_lost").notNull().default(0),
  lossRate: real("loss_rate").notNull().default(0),
  points: real("points").notNull().default(0),
  country: text("country"),
  discordId: text("discord_id"),
  bio: text("bio"),
  cleanSheets: integer("clean_sheets").notNull().default(0),
  rating: integer("rating").notNull().default(0),
  marketValue: integer("market_value").notNull().default(0),
  goalsScored: integer("goals_scored").notNull().default(0),
  draws: integer("draws").notNull().default(0),
  goalsConceded: integer("goals_conceded").notNull().default(0),
  manOfTheMatch: integer("man_of_the_match").notNull().default(0),
  yellowCards: integer("yellow_cards").notNull().default(0),
  redCards: integer("red_cards").notNull().default(0),
  gamingDevice: text("gaming_device"),
  deviceName: text("device_name"),
  konamiId: text("konami_id"),
  bloodGroup: text("blood_group"),
  profileComplete: boolean("profile_complete").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  badges: text("badges").array().notNull().default([]),
  role: text("role").notNull().default("player"),
  bannedUntil: timestamp("banned_until"),
  banReason: text("ban_reason"),
  bannedBy: text("banned_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertPlayerSchema = createInsertSchema(playersTable).omit({ id: true, createdAt: true });
export type InsertPlayer = z.infer<typeof insertPlayerSchema>;
export type Player = typeof playersTable.$inferSelect;
