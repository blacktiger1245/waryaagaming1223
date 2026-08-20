// Additive migration + verification for the Hall of Fame feature.
// Adds: season_id, status, games, trophies, goals, motm_awards, updated_at
// to hall_of_fame + helper indexes. Idempotent (ADD COLUMN IF NOT EXISTS).
//   pnpm --filter @workspace/db exec node src/migrate-hall-of-fame.mjs

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
  `ALTER TABLE "hall_of_fame" ADD COLUMN IF NOT EXISTS "season_id" integer`,
  `ALTER TABLE "hall_of_fame" ADD COLUMN IF NOT EXISTS "status" boolean NOT NULL DEFAULT false`,
  `ALTER TABLE "hall_of_fame" ADD COLUMN IF NOT EXISTS "games" integer NOT NULL DEFAULT 0`,
  `ALTER TABLE "hall_of_fame" ADD COLUMN IF NOT EXISTS "trophies" integer NOT NULL DEFAULT 0`,
  `ALTER TABLE "hall_of_fame" ADD COLUMN IF NOT EXISTS "goals" integer NOT NULL DEFAULT 0`,
  `ALTER TABLE "hall_of_fame" ADD COLUMN IF NOT EXISTS "motm_awards" integer NOT NULL DEFAULT 0`,
  `ALTER TABLE "hall_of_fame" ADD COLUMN IF NOT EXISTS "updated_at" timestamp NOT NULL DEFAULT now()`,
  `CREATE INDEX IF NOT EXISTS "hall_of_fame_status_idx" ON "hall_of_fame" ("status")`,
  `CREATE INDEX IF NOT EXISTS "hall_of_fame_player_idx" ON "hall_of_fame" ("player_id")`,
  `CREATE INDEX IF NOT EXISTS "hall_of_fame_season_idx" ON "hall_of_fame" ("season_id")`,
];

try {
  const cur = await run(`SELECT current_database() AS db, current_setting('server_version') AS ver`);
  console.log(`Connected OK -> database: ${cur.rows[0].db} (PostgreSQL ${cur.rows[0].ver})`);
  for (const stmt of DDL) await run(stmt);
  console.log("[MIGRATE] Applied Hall of Fame columns.");

  const cols = await run(
    `SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'hall_of_fame' AND column_name IN ('season_id','status','games','trophies','goals','motm_awards','updated_at') ORDER BY ordinal_position`,
  );
  console.log("[VERIFY] hall_of_fame columns present:");
  for (const c of cols.rows) console.log(`  ${c.column_name} ${c.data_type}${c.is_nullable === "NO" ? " NOT NULL" : ""}${c.column_default ? " DEFAULT " + c.column_default : ""}`);
} catch (err) {
  console.error("Failed (credentials hidden):", err.code ?? err.message ?? "unknown");
  process.exitCode = 1;
} finally {
  await pool.end().catch(() => {});
}