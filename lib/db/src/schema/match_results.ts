import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { matchesTable } from "./matches";
import { playersTable } from "./players";
import { matchPlayerGamesTable } from "./match_player_games";

// ---------------------------------------------------------------------------
// Fixture match-result image submissions.
//
// A player who participates in a fixture uploads a screenshot of the completed
// match. The submission enters a review queue (status = "pending") and an
// administrator verifies it. On approval the official fixture result and match
// statistics are written to the `matches` / `match_player_games` tables and the
// submission is frozen as "approved". Unknown values from the screenshot are
// never invented — they stay NULL and the admin confirms/corrects them first.
//
// Status flow:
//   pending  →  approved   (admin approved the screenshot + extracted data)
//   pending  →  rejected   (admin rejected with `rejection_reason`)
//   rejected →  pending    (player resubmitted a new screenshot)
// ---------------------------------------------------------------------------
export const matchResultSubmissionsTable = pgTable("match_result_submissions", {
  id: serial("id").primaryKey(),
  fixtureId: integer("fixture_id").notNull().references(() => matchesTable.id, { onDelete: "cascade" }),
  // When set, the submission belongs to this exact player-vs-player matchup
  // (match_player_games.id) inside a team fixture. NULL for solo fixtures, where
  // the fixture itself is the player matchup. `fixture_id` always points at the
  // parent fixture so the review queue / audit trail / cascade keep working.
  playerGameId: integer("player_game_id").references(() => matchPlayerGamesTable.id, { onDelete: "cascade" }),
  submittedBy: integer("submitted_by").notNull().references(() => playersTable.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("pending"), // pending | approved | rejected
  imagePath: text("image_path").notNull(),
  // Detected / confirmed statistics (home = participant1, away = participant2).
  // NULL means "Not detected" — the admin must confirm the value before approval.
  homeScore: integer("home_score"),
  awayScore: integer("away_score"),
  homePosition: integer("home_position"),
  awayPosition: integer("away_position"),
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
  rejectionReason: text("rejection_reason"),
  // Provenance of the OCR pass that produced the values above: the engine used,
  // how long it took, the raw text it read, per-field confidence/provenance and
  // the list of fields it could not confidently read. Stored as a JSON string so
  // the administrator can audit exactly where each number came from. NULL for
  // submissions that predate OCR support.
  ocrMetadata: text("ocr_metadata"),
  approvedBy: integer("approved_by"),
  approvedAt: timestamp("approved_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Immutable audit trail for every admin approve / reject action.
// `admin_id` is nullable because the legacy password-based admin session has no
// player row; in that case only `admin_name` (the admin username) is recorded.
export const matchResultAuditLogTable = pgTable("match_result_audit_log", {
  id: serial("id").primaryKey(),
  adminId: integer("admin_id").references(() => playersTable.id, { onDelete: "set null" }),
  adminName: text("admin_name"),
  action: text("action").notNull(), // approve | reject
  fixtureId: integer("fixture_id").notNull().references(() => matchesTable.id, { onDelete: "cascade" }),
  submissionId: integer("submission_id").notNull().references(() => matchResultSubmissionsTable.id, { onDelete: "cascade" }),
  previousStatus: text("previous_status").notNull(),
  newStatus: text("new_status").notNull(),
  rejectionReason: text("rejection_reason"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertMatchResultSubmissionSchema = createInsertSchema(matchResultSubmissionsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertMatchResultSubmission = z.infer<typeof insertMatchResultSubmissionSchema>;
export type MatchResultSubmission = typeof matchResultSubmissionsTable.$inferSelect;

export const insertMatchResultAuditLogSchema = createInsertSchema(matchResultAuditLogTable).omit({
  id: true,
  createdAt: true,
});
export type InsertMatchResultAuditLog = z.infer<typeof insertMatchResultAuditLogSchema>;
export type MatchResultAuditLog = typeof matchResultAuditLogTable.$inferSelect;