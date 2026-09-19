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
  // ── Player-vs-player statistics extracted from the screenshot ──
  // `Position` → `Possession`, `Corners` → `Corner Kicks`, `Yellow Cards` →
  // `Offside` and `Red Cards` → `Free Kicks`; the remaining six statistics were
  // added by the same migration. NULL means "Not detected" — the admin must
  // confirm the value before approval. `Successful Passes` is a single field.
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
  // ── Player-name verification (screenshot names vs the registered matchup) ──
  // Before approval the two names read off the screenshot are compared against
  // the players registered for the exact player-vs-player matchup. The verdict
  // and both name pairs are frozen here so the admin review screen can show
  // "expected vs detected" without re-running OCR. NULL = the submission
  // predates name verification. `name_verification_notes` holds a JSON object:
  // { notes, homeStatus, awayStatus, homeMethod, awayMethod, sidesSwapped,
  //   foreignMatchup }.
  nameVerificationStatus: text("name_verification_status"), // verified | failed | not_detected | not_applicable
  homeExpectedName: text("home_expected_name"),
  homeScreenshotName: text("home_screenshot_name"),
  awayExpectedName: text("away_expected_name"),
  awayScreenshotName: text("away_screenshot_name"),
  nameVerificationNotes: text("name_verification_notes"),
  // ── Admin-controlled Home/Away player assignment ──
  // At approval time the administrator explicitly chooses which registered
  // player is the Home side and which is the Away side of the screenshot. The
  // OCR-detected statistics are then assigned by screenshot side: the selected
  // Home player receives the Home columns, the selected Away player the Away
  // columns. These four columns permanently record that decision. NULL = not
  // yet assigned (pending submissions).
  assignedHomePlayerId: integer("assigned_home_player_id"),
  assignedHomePlayerName: text("assigned_home_player_name"),
  assignedAwayPlayerId: integer("assigned_away_player_id"),
  assignedAwayPlayerName: text("assigned_away_player_name"),
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