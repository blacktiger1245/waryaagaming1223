import { pool } from "@workspace/db";
import { logger } from "./logger";

/**
 * Applies the additive, idempotent schema patches the bracket feature needs.
 *
 * These columns live in the drizzle schema and were shipped as standalone
 * migration files (lib/db/drizzle/0004_match_stage.sql, 0005_match_bracket_links.sql),
 * but deployments do not run `drizzle-kit push` automatically. If they are
 * missing, POST /admin/tournaments/:id/generate-matches fails immediately
 * because the match rows now persist `stage` and parent/next bracket links.
 *
 * Every statement uses `ADD COLUMN IF NOT EXISTS` so this is safe to run on
 * every boot and on every schema revision.
 */
export async function ensureMatchBracketSchema(): Promise<void> {
  const statements = [
    `ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "stage" integer DEFAULT 1 NOT NULL;`,
    // Backfill: mark existing knockout matches (by knockout round names) as stage 2.
    `UPDATE "matches" SET "stage" = 2 WHERE "stage" = 1 AND "round_name" ~* '(Quarter Finals|Semi Finals|Grand Final|Final|Round of|Third Place)';`,
    `ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "parent_match1_id" integer;`,
    `ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "parent_match2_id" integer;`,
    `ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "next_match_id" integer;`,
    `ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "next_slot" integer;`,
  ];

  try {
    for (const sql of statements) {
      await pool.query(sql);
    }
    logger.info("Ensured matches bracket schema");
  } catch (err) {
    // Interrupted DDL must not prevent boot; report and continue so the
    // global JSON error handler can surface a meaningful message at request time.
    logger.warn({ err }, "Could not ensure matches bracket schema");
  }
}