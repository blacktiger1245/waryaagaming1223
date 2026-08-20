import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Stage semantics (used for Round Robin + Knock-out tournaments):
//   stage = 1 → Group Stage (roundName is the group, e.g. "Group A")
//   stage = 2 → Knock-out (roundName is the round, e.g. "Quarter Finals")
// Other formats (single elimination, plain round robin, double elimination)
// keep the default stage = 1 and are unaffected.
export const matchesTable = pgTable("matches", {
  id: serial("id").primaryKey(),
  tournamentId: integer("tournament_id").notNull(),
  round: integer("round").notNull().default(1),
  roundName: text("round_name"),
  stage: integer("stage").notNull().default(1),
  // Stable bracket relationships (used by the Stage 2 Knock-out bracket).
  // parentMatch1Id/parentMatch2Id = the two matches whose winners fill this
  // match's participant1/participant2 slots (null for pre-seeded teams/BYEs).
  // nextMatchId + nextSlot = the match this match's winner advances to, and
  // whether it lands in that next match's participant1 (1) or participant2 (2).
  parentMatch1Id: integer("parent_match1_id"),
  parentMatch2Id: integer("parent_match2_id"),
  nextMatchId: integer("next_match_id"),
  nextSlot: integer("next_slot"),
  status: text("status").notNull().default("scheduled"),
  participant1Id: integer("participant1_id"),
  participant1Name: text("participant1_name"),
  participant1Score: integer("participant1_score"),
  participant2Id: integer("participant2_id"),
  participant2Name: text("participant2_name"),
  participant2Score: integer("participant2_score"),
  winnerId: integer("winner_id"),
  winnerName: text("winner_name"),
  scheduledAt: text("scheduled_at"),
  streamUrl: text("stream_url"),
  manOfTheMatchId: integer("man_of_the_match_id"),
  manOfTheMatchName: text("man_of_the_match_name"),
  // Referee assigned to referee this match (only they — plus owners, global
  // admins and tournament admins — may edit the result).
  assignedRefereeId: integer("assigned_referee_id"),
  // Audit trail: who last set the result and when.
  resultSetBy: integer("result_set_by"),
  resultSetAt: timestamp("result_set_at"),
  participant1YellowCards: integer("participant1_yellow_cards").notNull().default(0),
  participant1RedCards: integer("participant1_red_cards").notNull().default(0),
  participant2YellowCards: integer("participant2_yellow_cards").notNull().default(0),
  participant2RedCards: integer("participant2_red_cards").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertMatchSchema = createInsertSchema(matchesTable).omit({ id: true, createdAt: true });
export type InsertMatch = z.infer<typeof insertMatchSchema>;
export type Match = typeof matchesTable.$inferSelect;
