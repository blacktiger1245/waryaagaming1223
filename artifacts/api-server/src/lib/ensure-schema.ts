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
    // Make tournament start_date nullable so active tournaments can be created without a date.
    `ALTER TABLE "tournaments" ALTER COLUMN "start_date" DROP NOT NULL;`,
  ];

  try {
    for (const sql of statements) {
      await pool.query(sql);
    }

    // Safe runtime verification — only presence/counts, never credentials.
    // Confirms the database actually connected to by the API has the bracket
    // columns and how many rows carry stable parent/next links.
    try {
      const matchColsRes = await pool.query(
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
      const tourneyColRes = await pool.query(
        `SELECT is_nullable FROM information_schema.columns
         WHERE table_name = 'tournaments' AND column_name = 'start_date'`,
      );
      const matchColumns = matchColsRes.rows.map((r: { column_name: string }) => r.column_name);
      const counts = countsRes.rows[0] ?? { stage2: 0, linked: 0 };
      logger.info(
        {
          matchesColumns: matchColumns,
          stage2Rows: Number(counts.stage2 ?? 0),
          bracketLinkedRows: Number(counts.linked ?? 0),
          tournamentStartDateNullable: tourneyColRes.rows[0]?.is_nullable === "YES",
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

/**
 * Creates the WG Academy posts table if it does not exist (additive, idempotent).
 * Replaces the old academy_sections table used by the previous Tournament Rules
 * style academy. Safe to run on every boot.
 */
export async function ensureAcademySchema(): Promise<void> {
  const statements = [
    `CREATE TABLE IF NOT EXISTS "academy_posts" (
       "id" serial PRIMARY KEY,
       "category" text NOT NULL DEFAULT 'player_training',
       "title" text NOT NULL,
       "body" text NOT NULL DEFAULT '',
       "image_url" text,
       "sort_order" integer NOT NULL DEFAULT 0,
       "is_published" boolean NOT NULL DEFAULT true,
       "updated_by" text,
       "updated_at" timestamp NOT NULL DEFAULT now()
     );`,
  ];

  try {
    for (const sql of statements) {
      await pool.query(sql);
    }
  } catch (err) {
    logger.warn({ err }, "Could not ensure academy schema");
  }
}