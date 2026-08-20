// Safe, additive migration + verification for the Ads table.
//
// - Reads NEON_DATABASE_URL / DATABASE_URL from the shell env, then from .env.
// - Never prints the connection string, its user, or its password.
// - Step 1: read-only inspection of the existing public schema.
// - Step 2: applies ONLY additive DDL (CREATE TABLE IF NOT EXISTS /
//           CREATE INDEX IF NOT EXISTS) for the `ads` table + indexes.
// - Step 3: verifies the new table, its columns and indexes.
//
// Run from the repo root with the @workspace/db package resolvable:
//   pnpm --filter @workspace/db exec node src/migrate-ads.mjs

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

// ---- Load .env (no third-party dotenv needed) --------------------------------
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
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    result[line.slice(0, eq).trim()] = value;
  }
  return result;
}

const envFile = loadEnvFile();
const connectionString =
  process.env.NEON_DATABASE_URL ??
  process.env.DATABASE_URL ??
  envFile.NEON_DATABASE_URL ??
  envFile.DATABASE_URL;

if (!connectionString) {
  console.error(
    "DATABASE_URL is not set.\n" +
      "Add DATABASE_URL=<your-neon-connection-string> to the repo root .env " +
      "(or set it as an environment variable) and re-run this script.\n" +
      "No database changes were made.",
  );
  process.exit(1);
}

// Neon uses "channel_binding=require", which the pg driver does not need.
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

pool.on("error", (err) => {
  console.error("Pool error (connection string hidden):", err.code ?? err.name ?? "unknown");
});

function run(sqlText) {
  return pool.query(sqlText);
}

const ADDITIVE_DDL = [
  `CREATE TABLE IF NOT EXISTS "ads" (
    "id" serial PRIMARY KEY NOT NULL,
    "video_url" text NOT NULL,
    "target_url" text NOT NULL,
    "close_after_seconds" integer NOT NULL,
    "is_active" boolean NOT NULL DEFAULT true,
    "created_by" integer NOT NULL,
    "created_at" timestamp NOT NULL DEFAULT now(),
    "updated_at" timestamp NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS "ads_active_idx" ON "ads" ("is_active")`,
  `CREATE INDEX IF NOT EXISTS "ads_created_at_idx" ON "ads" ("created_at")`,
];

// ---- STEP 1 — read-only inspection ------------------------------------------
try {
  const current = await run(
    `SELECT current_database() AS db, current_setting('server_version') AS ver`,
  );
  console.log(`Connected OK  ->  database: ${current.rows[0].db}  (PostgreSQL ${current.rows[0].ver})`);

  const existing = await run(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'ads'`,
  );

  // ---- STEP 2 — apply (additive only) --------------------------------------
  console.log(
    existing.rowCount === 1
      ? "\n[MIGRATE] ads table already exists — nothing to apply."
      : "\n[MIGRATE] Applying additive DDL (only the ads table + indexes)...",
  );
  for (const stmt of ADDITIVE_DDL) {
    await run(stmt);
  }
  console.log("[MIGRATE] Applied.");

  // ---- STEP 3 — verify ------------------------------------------------------
  const columns = await run(
    `SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'ads' ORDER BY ordinal_position`,
  );
  console.log(`\n[VERIFY] ads columns (${columns.rowCount}):`);
  for (const c of columns.rows) {
    console.log(
      `  ${c.column_name}  ${c.data_type}${c.is_nullable === "YES" ? "" : " NOT NULL"}${c.column_default ? " DEFAULT " + c.column_default : ""}`,
    );
  }

  const indexes = await run(
    `SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'ads' ORDER BY indexname`,
  );
  console.log("\n[VERIFY] Indexes:");
  console.log(indexes.rows.length === 0 ? "  none" : indexes.rows.map((r) => "  " + r.indexname).join("\n"));

  console.log("\nDone. No existing tables, data, or objects were modified.");
} catch (err) {
  console.error(
    "\nFailed (connection or query error; credentials hidden):",
    err.code ?? err.message ?? "unknown",
  );
  process.exitCode = 1;
} finally {
  await pool.end().catch(() => {});
}