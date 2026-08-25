import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const tournamentsTable = pgTable("tournaments", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  status: text("status").notNull().default("upcoming"),
  format: text("format").notNull().default("single-elimination"),
  game: text("game").notNull().default("eFootball"),
  maxParticipants: integer("max_participants").notNull().default(16),
  currentParticipants: integer("current_participants").notNull().default(0),
  prizePool: text("prize_pool").notNull().default("$0"),
  startDate: text("start_date"),
  endDate: text("end_date"),
  rules: text("rules"),
  streamUrl: text("stream_url"),
  winnerId: integer("winner_id"),
  winnerName: text("winner_name"),
  logoUrl: text("logo_url"),
  hostedBy: text("hosted_by"),
  tournamentType: text("tournament_type").notNull().default("solo"),
  seasonId: integer("season_id"),
  categoryId: integer("category_id"),
  groupCount: integer("group_count").notNull().default(4),
  qualifyCount: integer("qualify_count"),
  thirdPlaceMatch: boolean("third_place_match").notNull().default(false),
  teamCount: integer("team_count"),
  isClanTournament: boolean("is_clan_tournament").notNull().default(false),
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertTournamentSchema = createInsertSchema(tournamentsTable).omit({ id: true, createdAt: true });
export type InsertTournament = z.infer<typeof insertTournamentSchema>;
export type Tournament = typeof tournamentsTable.$inferSelect;
