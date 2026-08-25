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

    // Safe runtime verification — only presence/counts, never credentials.
    // Confirms the database actually connected to by the API has the bracket
    // columns and how many rows carry stable parent/next links.
    try {
      const colsRes = await pool.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_name = 'matches'
           AND column_name IN ('stage','parent_match1_id','parent_match2_id','next_match_id','next_slot')
         ORDER BY column_name`,
      );
      const countsRes = await pool.query(
        `SELECT
           count(*) FILTER (WHERE stage = 2) AS stage2,
           count(*) FILTER (WHERE stage = 2 AND (parent_match1_id IS NOT NULL OR parent_match2_id IS NOT NULL OR next_match_id IS NOT NULL)) AS linked
         FROM matches`,
      );
      const present = colsRes.rows.map((r: { column_name: string }) => r.column_name);
      const counts = countsRes.rows[0] ?? { stage2: 0, linked: 0 };
      logger.info(
        {
          matchesColumns: present,
          stage2Rows: Number(counts.stage2 ?? 0),
          bracketLinkedRows: Number(counts.linked ?? 0),
        },
        "Matches bracket schema verified",
      );
    } catch (verifyErr) {
      logger.warn({ err: verifyErr }, "Could not verify matches bracket schema");
    }
  } catch (err) {
    // Interrupted DDL must not prevent boot; report and continue so the
    // global JSON error handler can surface a meaningful message at request time.
    logger.warn({ err }, "Could not ensure matches bracket schema");
  }
}