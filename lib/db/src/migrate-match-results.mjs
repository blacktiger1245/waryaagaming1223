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

const MATCH_RESULT_STAT_COLUMNS = [
  "possession",
  "shots",
  "shots_on_target",
  "corner_kicks",
  "offside",
  "free_kicks",
  "fouls",
  "successful_passes",
  "crosses",
  "interceptions",
  "tackles",
  "saves",
].flatMap((stat) => [`home_${stat}`, `away_${stat}`]);

const ADDITIVE_DDL = [
  `CREATE TABLE IF NOT EXISTS "match_result_submissions" (
     "id" serial PRIMARY KEY,
     "fixture_id" integer NOT NULL REFERENCES "matches"("id") ON DELETE CASCADE,
     "submitted_by" integer NOT NULL REFERENCES "players"("id") ON DELETE CASCADE,
     "status" text NOT NULL DEFAULT 'pending',
     "image_path" text NOT NULL,
     "home_score" integer,
     "away_score" integer,
     "home_possession" integer,
     "away_possession" integer,
     "home_shots" integer,
     "away_shots" integer,
     "home_shots_on_target" integer,
     "away_shots_on_target" integer,
     "home_corner_kicks" integer,
     "away_corner_kicks" integer,
     "home_offside" integer,
     "away_offside" integer,
     "home_free_kicks" integer,
     "away_free_kicks" integer,
     "home_fouls" integer,
     "away_fouls" integer,
     "home_successful_passes" integer,
     "away_successful_passes" integer,
     "home_crosses" integer,
     "away_crosses" integer,
     "home_interceptions" integer,
     "away_interceptions" integer,
     "home_tackles" integer,
     "away_tackles" integer,
     "home_saves" integer,
     "away_saves" integer,
     "name_verification_status" text,
     "home_expected_name" text,
     "home_screenshot_name" text,
     "away_expected_name" text,
     "away_screenshot_name" text,
     "name_verification_notes" text,
     "rejection_reason" text,
     "ocr_metadata" text,
     "approved_by" integer,
     "approved_at" timestamp,
     "created_at" timestamp NOT NULL DEFAULT now(),
     "updated_at" timestamp NOT NULL DEFAULT now()
   )`,
  `ALTER TABLE "match_result_submissions" ADD COLUMN IF NOT EXISTS "ocr_metadata" text`,
  // Player-name verification: verdict + expected/detected name pairs frozen on
  // the submission so the admin review can show them without re-running OCR.
  `ALTER TABLE "match_result_submissions" ADD COLUMN IF NOT EXISTS "name_verification_status" text`,
  `ALTER TABLE "match_result_submissions" ADD COLUMN IF NOT EXISTS "home_expected_name" text`,
  `ALTER TABLE "match_result_submissions" ADD COLUMN IF NOT EXISTS "home_screenshot_name" text`,
  `ALTER TABLE "match_result_submissions" ADD COLUMN IF NOT EXISTS "away_expected_name" text`,
  `ALTER TABLE "match_result_submissions" ADD COLUMN IF NOT EXISTS "away_screenshot_name" text`,
  `ALTER TABLE "match_result_submissions" ADD COLUMN IF NOT EXISTS "name_verification_notes" text`,
  // Admin-controlled Home/Away player assignment, frozen at approval.
  `ALTER TABLE "match_result_submissions" ADD COLUMN IF NOT EXISTS "assigned_home_player_id" integer`,
  `ALTER TABLE "match_result_submissions" ADD COLUMN IF NOT EXISTS "assigned_home_player_name" text`,
  `ALTER TABLE "match_result_submissions" ADD COLUMN IF NOT EXISTS "assigned_away_player_id" integer`,
  `ALTER TABLE "match_result_submissions" ADD COLUMN IF NOT EXISTS "assigned_away_player_name" text`,
  // Links a submission to the exact player-vs-player game inside a team fixture.
  `ALTER TABLE "match_result_submissions" ADD COLUMN IF NOT EXISTS "player_game_id" integer REFERENCES "match_player_games"("id") ON DELETE CASCADE`,
  `CREATE INDEX IF NOT EXISTS "match_result_submissions_player_game_idx" ON "match_result_submissions" ("player_game_id")`,
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
  // ── Rename the legacy statistics without losing stored results ──────────────
  // `Position` → `Possession`, `Corners` → `Corner Kicks`, `Yellow Cards` →
  // `Offside`, `Red Cards` → `Free Kicks`. PostgreSQL has no
  // `RENAME COLUMN IF EXISTS`, so the catalog is inspected first. If the legacy
  // and the replacement column both exist the legacy value is copied across (only
  // where the replacement is NULL) and the legacy column is dropped, so nothing is
  // lost and no duplicate column is left behind.
  ...["match_result_submissions", "match_player_games"].map(
    (table) => `DO $$
     DECLARE
       side text;
       pair text[];
       legacy text;
       current_col text;
     BEGIN
       FOREACH side IN ARRAY ARRAY['home', 'away'] LOOP
         FOREACH pair SLICE 1 IN ARRAY ARRAY[
           ['position', 'possession'],
           ['corners', 'corner_kicks'],
           ['yellow_cards', 'offside'],
           ['red_cards', 'free_kicks']
         ] LOOP
           legacy := side || '_' || pair[1];
           current_col := side || '_' || pair[2];
           IF EXISTS (
             SELECT 1 FROM information_schema.columns
             WHERE table_schema = current_schema()
               AND table_name = '${table}'
               AND column_name = legacy
           ) THEN
             IF EXISTS (
               SELECT 1 FROM information_schema.columns
               WHERE table_schema = current_schema()
                 AND table_name = '${table}'
                 AND column_name = current_col
             ) THEN
               EXECUTE format('UPDATE ${table} SET %I = COALESCE(%I, %I)', current_col, current_col, legacy);
               EXECUTE format('ALTER TABLE ${table} DROP COLUMN %I', legacy);
             ELSE
               EXECUTE format('ALTER TABLE ${table} RENAME COLUMN %I TO %I', legacy, current_col);
             END IF;
           END IF;
         END LOOP;
       END LOOP;
     END $$;`,
  ),
  // Add whatever the database is still missing. `Successful Passes` is ONE column
  // (`successful_passes`) — never a separate `passes` + `successful` pair.
  ...["match_result_submissions", "match_player_games"].flatMap((table) =>
    MATCH_RESULT_STAT_COLUMNS.map(
      (c) => `ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "${c}" integer`,
    ),
  ),
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

  const cols = await run(
    `SELECT table_name, column_name FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name IN ('match_result_submissions', 'match_player_games')
       AND (column_name LIKE 'home\\_%' OR column_name LIKE 'away\\_%')`,
  );
  const byTable = { match_result_submissions: new Set(), match_player_games: new Set() };
  for (const row of cols.rows) byTable[row.table_name]?.add(row.column_name);
  const legacy = ["home_position", "home_corners", "home_yellow_cards", "home_red_cards"];
  for (const table of Object.keys(byTable)) {
    const missing = MATCH_RESULT_STAT_COLUMNS.filter((c) => !byTable[table].has(c));
    const leftover = legacy.filter((c) => byTable[table].has(c));
    console.log(
      `[VERIFY] ${table}: ${MATCH_RESULT_STAT_COLUMNS.length - missing.length}/${MATCH_RESULT_STAT_COLUMNS.length} home_*/away_* statistics present` +
        (missing.length ? ` | missing: ${missing.join(", ")}` : "") +
        (leftover.length ? ` | LEGACY COLUMNS STILL PRESENT: ${leftover.join(", ")}` : " | no legacy columns"),
    );
  }
  console.log("\nDone. No existing statistic values were deleted; legacy column values were migrated.");
} catch (err) {
  console.error("\nFailed:", err.code ?? err.message ?? "unknown");
  process.exitCode = 1;
} finally {
  await pool.end().catch(() => {});
}