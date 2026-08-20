// Additive migration + verification for the match referee/result columns.
// Adds: assigned_referee_id, result_set_by, result_set_at (+ helper indexes).
// Idempotent (ADD COLUMN IF NOT EXISTS). Reads DB URL from env then .env.
//   pnpm --filter @workspace/db exec node src/migrate-match-referees.mjs

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
  console.error("DATABASE_URL is not set. No changes were made.");
  process.exit(1);
}

let driver = connectionString;
{
  const q = driver.indexOf("?");
  if (q !== -1) {
    const base = driver.slice(0, q);
    const params = driver.slice(q + 1).split("&").filter((p) => !p.toLowerCase().startsWith("channel_binding="));
    driver = params.length ? `${base}?${params.join("&")}` : base;
  }
}

const { default: pg } = await import("pg");
const pool = new pg.Pool({ connectionString: driver, max: 2 });
const run = (sql) => pool.query(sql);

const DDL = [
  `ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "assigned_referee_id" integer`,
  `ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "result_set_by" integer`,
  `ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "result_set_at" timestamp`,
  `CREATE INDEX IF NOT EXISTS "matches_assigned_referee_idx" ON "matches" ("assigned_referee_id")`,
  `CREATE INDEX IF NOT EXISTS "matches_result_set_at_idx" ON "matches" ("result_set_at")`,
];

try {
  const cur = await run(`SELECT current_database() AS db, current_setting('server_version') AS ver`);
  console.log(`Connected OK -> database: ${cur.rows[0].db} (PostgreSQL ${cur.rows[0].ver})`);
  for (const stmt of DDL) await run(stmt);
  console.log("[MIGRATE] Applied match referee/result columns.");

  const cols = await run(
    `SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'matches' AND column_name IN ('assigned_referee_id','result_set_by','result_set_at') ORDER BY ordinal_position`,
  );
  console.log("[VERIFY] matches columns present:");
  for (const c of cols.rows) console.log(`  ${c.column_name} ${c.data_type}${c.is_nullable === "YES" ? "" : " NOT NULL"}`);
} catch (err) {
  console.error("Failed (credentials hidden):", err.code ?? err.message ?? "unknown");
  process.exitCode = 1;
} finally {
  await pool.end().catch(() => {});
}