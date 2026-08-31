// Safe, additive migration for WG Coins (player coin balances).
//
// - Reads NEON_DATABASE_URL / DATABASE_URL from the shell env, then from .env.
// - Adds the `coin_balance` column to `players` and creates `coin_transactions`.
//
// Run from the repo root with the @workspace/db package resolvable:
//   pnpm --filter @workspace/db exec node src/migrate-coins.mjs

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
  `ALTER TABLE "players" ADD COLUMN IF NOT EXISTS "contract_seasons" integer`,
  `ALTER TABLE "players" ADD COLUMN IF NOT EXISTS "contract_seasons_left" integer`,
  `ALTER TABLE "players" ADD COLUMN IF NOT EXISTS "contract_signed_season_id" integer`,
  `ALTER TABLE "players" ADD COLUMN IF NOT EXISTS "coin_balance" integer NOT NULL DEFAULT 0`,
  `CREATE TABLE IF NOT EXISTS "coin_transactions" (
    "id" serial PRIMARY KEY NOT NULL,
    "player_id" integer NOT NULL REFERENCES "players"("id") ON DELETE CASCADE,
    "package_id" text NOT NULL,
    "coins" integer NOT NULL,
    "price_usd" integer NOT NULL,
    "created_at" timestamp NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS "coin_transactions_player_idx" ON "coin_transactions" ("player_id")`,
];

try {
  const current = await run(`SELECT current_database() AS db, current_setting('server_version') AS ver`);
  console.log(`Connected OK -> database: ${current.rows[0].db} (PostgreSQL ${current.rows[0].ver})`);
  console.log("\n[MIGRATE] Applying additive DDL (coin_balance column + coin_transactions table)...");
  for (const stmt of ADDITIVE_DDL) {
    await run(stmt);
  }
  console.log("[MIGRATE] Applied.");

  const cols = await run(
    `SELECT column_name, data_type, column_default FROM information_schema.columns WHERE table_name = 'players' AND column_name = 'coin_balance'`,
  );
  console.log(`\n[VERIFY] players.coin_balance: ${cols.rowCount === 1 ? JSON.stringify(cols.rows[0]) : "MISSING"}`);
  const tx = await run(
    `SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'coin_transactions'`,
  );
  console.log(`[VERIFY] coin_transactions table exists: ${tx.rows[0].n === 1}`);
  console.log("\nDone. No existing data was modified.");
} catch (err) {
  console.error("\nFailed:", err.code ?? err.message ?? "unknown");
  process.exitCode = 1;
} finally {
  await pool.end().catch(() => {});
}