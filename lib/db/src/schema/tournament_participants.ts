import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const tournamentParticipantsTable = pgTable("tournament_participants", {
  id: serial("id").primaryKey(),
  tournamentId: integer("tournament_id").notNull(),
  type: text("type").notNull().default("player"),
  playerId: integer("player_id"),
  teamId: integer("team_id"),
  seed: integer("seed"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertTournamentParticipantSchema = createInsertSchema(tournamentParticipantsTable).omit({ id: true, createdAt: true });
export type InsertTournamentParticipant = z.infer<typeof insertTournamentParticipantSchema>;
export type TournamentParticipant = typeof tournamentParticipantsTable.$inferSelect;
