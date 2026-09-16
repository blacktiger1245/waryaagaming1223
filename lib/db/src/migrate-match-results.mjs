// Safe, additive migration for the fixture match-result submission & approval
// workflow (screenshot upload → admin verification → auto result/statistics).
//
// - Reads NEON_DATABASE_URL / DATABASE_URL from the shell env, then from .env.
// - Creates `match_result_submissions` and `match_result_audit_log`.
//
// Run from the repo root with the @workspace/db package resolvable:
//   pnpm --filter @workspace/db exec node src/migrate-match-results.mjs
//
// (The API server also applies this same DDL idempotently at boot via
//  artifacts/api-server/src/lib/ensure-schema.ts -> ensureMatchResultSchema().)

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

function loadEnvFile() {
  const envPath = path.join(repoRoot, ".env");
  if (!existsSync(envPath)) return {};
  const result = {};
  for (const rawLine of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    result[line.slice(0, eq).trim()] = value;
  }
  return result;
}

const envFile = loadEnvFile();
const connectionString =
  process.env.NEON_DATABASE_URL ?? process.env.DATABASE_URL ?? envFile.NEON_DATABASE_URL ?? envFile.DATABASE_URL;

if (!connectionString) {
  console.error("DATABASE_URL is not set. No database changes were made.");
  process.exit(1);
}

let driverConnectionString = connectionString;
{
  const q = driverConnectionString.indexOf("?");
  if (q !== -1) {
    const base = driverConnectionString.slice(0, q);
    const params = driverConnectionString
      .slice(q + 1)
      .split("&")
      .filter((p) => !p.toLowerCase().startsWith("channel_binding="));
    driverConnectionString = params.length ? `${base}?${params.join("&")}` : base;
  }
}

const { default: pg } = await import("pg");
const pool = new pg.Pool({ connectionString: driverConnectionString, max: 2 });

function run(sqlText) {
  return pool.query(sqlText);
}

const ADDITIVE_DDL = [
  `CREATE TABLE IF NOT EXISTS "match_result_submissions" (
     "id" serial PRIMARY KEY,
     "fixture_id" integer NOT NULL REFERENCES "matches"("id") ON DELETE CASCADE,
     "submitted_by" integer NOT NULL REFERENCES "players"("id") ON DELETE CASCADE,
     "status" text NOT NULL DEFAULT 'pending',
     "image_path" text NOT NULL,
     "home_score" integer,
     "away_score" integer,
     "home_position" integer,
     "away_position" integer,
     "home_shots" integer,
     "away_shots" integer,
     "home_shots_on_target" integer,
     "away_shots_on_target" integer,
     "home_corners" integer,
     "away_corners" integer,
     "home_yellow_cards" integer,
     "away_yellow_cards" integer,
     "home_red_cards" integer,
     "away_red_cards" integer,
     "rejection_reason" text,
     "ocr_metadata" text,
     "approved_by" integer,
     "approved_at" timestamp,
     "created_at" timestamp NOT NULL DEFAULT now(),
     "updated_at" timestamp NOT NULL DEFAULT now()
   )`,
  `ALTER TABLE "match_result_submissions" ADD COLUMN IF NOT EXISTS "ocr_metadata" text`,
  `CREATE INDEX IF NOT EXISTS "match_result_submissions_status_idx" ON "match_result_submissions" ("status")`,
  `CREATE INDEX IF NOT EXISTS "match_result_submissions_fixture_idx" ON "match_result_submissions" ("fixture_id")`,
  `CREATE TABLE IF NOT EXISTS "match_result_audit_log" (
     "id" serial PRIMARY KEY,
     "admin_id" integer REFERENCES "players"("id") ON DELETE SET NULL,
     "admin_name" text,
     "action" text NOT NULL,
     "fixture_id" integer NOT NULL REFERENCES "matches"("id") ON DELETE CASCADE,
     "submission_id" integer NOT NULL REFERENCES "match_result_submissions"("id") ON DELETE CASCADE,
     "previous_status" text NOT NULL,
     "new_status" text NOT NULL,
     "rejection_reason" text,
     "created_at" timestamp NOT NULL DEFAULT now()
   )`,
  `ALTER TABLE "match_result_audit_log" ALTER COLUMN "admin_id" DROP NOT NULL`,
  `CREATE INDEX IF NOT EXISTS "match_result_audit_log_fixture_idx" ON "match_result_audit_log" ("fixture_id")`,
  // Position columns on the per-match player-game stats, written on approval.
  `ALTER TABLE "match_player_games" ADD COLUMN IF NOT EXISTS "home_position" integer`,
  `ALTER TABLE "match_player_games" ADD COLUMN IF NOT EXISTS "away_position" integer`,
];

try {
  const current = await run(`SELECT current_database() AS db, current_setting('server_version') AS ver`);
  console.log(`Connected OK -> database: ${current.rows[0].db} (PostgreSQL ${current.rows[0].ver})`);
  console.log("\n[MIGRATE] Applying additive DDL (match_result_submissions + match_result_audit_log)...");
  for (const stmt of ADDITIVE_DDL) {
    await run(stmt);
  }
  console.log("[MIGRATE] Applied.");

  const submissions = await run(
    `SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'match_result_submissions'`,
  );
  const audit = await run(
    `SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'match_result_audit_log'`,
  );
  console.log(`\n[VERIFY] match_result_submissions table exists: ${submissions.rows[0].n === 1}`);
  console.log(`[VERIFY] match_result_audit_log table exists: ${audit.rows[0].n === 1}`);
  console.log("\nDone. No existing data was modified.");
} catch (err) {
  console.error("\nFailed:", err.code ?? err.message ?? "unknown");
  process.exitCode = 1;
} finally {
  await pool.end().catch(() => {});
}