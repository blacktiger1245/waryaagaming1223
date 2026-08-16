// Safe, additive migration + verification for the Agent Chat tables.
//
// - Reads DATABASE_URL from the shell env, then from .env (repo root).
// - Never prints the connection string, its user, or its password.
// - Step 1: read-only inspection of the existing public schema.
// - Step 2: applies ONLY additive DDL (CREATE TABLE IF NOT EXISTS /
//           CREATE INDEX IF NOT EXISTS) for agent_conversations + agent_messages.
// - Step 3: verifies the new tables, their columns and indexes.
//
// Run from the repo root with the @workspace/db package resolvable:
//   pnpm --filter @workspace/db exec node src/migrate-agent-chat.mjs

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
// Strip that one parameter for the driver while keeping .env untouched.
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
  // Do not print the connection string / password.
  console.error("Pool error (connection string hidden):", err.code ?? err.name ?? "unknown");
});

function run(sqlText) {
  return pool.query(sqlText);
}

const ADDITIVE_DDL = [
  `CREATE TABLE IF NOT EXISTS "agent_conversations" (
    "id" serial PRIMARY KEY NOT NULL,
    "agent_player_id" integer NOT NULL,
    "player_id" integer NOT NULL,
    "unread_by_agent" integer DEFAULT 0 NOT NULL,
    "unread_by_player" integer DEFAULT 0 NOT NULL,
    "player_last_seen_at" timestamp,
    "agent_last_seen_at" timestamp,
    "created_at" timestamp DEFAULT now() NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "agent_conversations_pair_unique" ON "agent_conversations" ("agent_player_id", "player_id")`,
  `CREATE TABLE IF NOT EXISTS "agent_messages" (
    "id" serial PRIMARY KEY NOT NULL,
    "conversation_id" integer NOT NULL,
    "sender_player_id" integer NOT NULL,
    "sender_role" text NOT NULL,
    "text" text NOT NULL,
    "read_at" timestamp,
    "sent_at" timestamp DEFAULT now() NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS "agent_messages_conversation_idx" ON "agent_messages" ("conversation_id")`,
];
// ---- STEP 1 — read-only inspection ------------------------------------
try {
  const current = await run(`SELECT current_database() AS db, current_setting('server_version') AS ver`);
  console.log(`Connected OK  ->  database: ${current.rows[0].db}  (PostgreSQL ${current.rows[0].ver})`);

  const tables = await run(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name`,
  );
  console.log(`\n[INSPECT] Existing public tables (${tables.rowCount}):`);
  console.log(tables.rows.map((r) => r.table_name).join(", "));

  const playersCols = await run(
    `SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'players' ORDER BY ordinal_position`,
  );
  console.log(`\n[INSPECT] players columns (${playersCols.rowCount}):`);
  console.log(
    playersCols.rows
      .map((c) => `${c.column_name} ${c.data_type}${c.is_nullable === "YES" ? "" : " NOT NULL"}`)
      .join(", "),
  );

  const agentTables = await run(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('agent_conversations', 'agent_messages') ORDER BY table_name`,
  );

  // ---- STEP 2 — apply (additive only); skipped in INSPECT-ONLY mode --------
  if (process.env.AGENT_CHAT_INSPECT_ONLY !== "1") {
    if (agentTables.rowCount === 2) {
      console.log("\n[MIGRATE] agent_conversations + agent_messages already exist — nothing to apply.");
    } else {
      console.log(
        "\n[MIGRATE] Applying additive DDL (only new tables + indexes, existing data untouched)...",
      );
      for (const stmt of ADDITIVE_DDL) {
        await run(stmt);
      }
      console.log("[MIGRATE] Applied.");
    }
  } else {
    console.log("\n[INSPECT-ONLY] No changes applied.");
  }

  // ---- STEP 3 — verify -------------------------------------------------
  const verify = await run(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('agent_conversations', 'agent_messages') ORDER BY table_name`,
  );
  console.log(
    `\n[VERIFY] New tables present: ${verify.rows.length === 0 ? "NONE" : verify.rows.map((r) => r.table_name).join(", ")}`,
  );

  const columns = await run(
    `SELECT table_name, column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = 'public' AND table_name IN ('agent_conversations', 'agent_messages') ORDER BY table_name, ordinal_position`,
  );
  console.log("\n[VERIFY] Column layout:");
  for (const c of columns.rows) {
    console.log(
      `  ${c.table_name}.${c.column_name}  ${c.data_type}${c.is_nullable === "YES" ? "" : " NOT NULL"}${c.column_default ? " DEFAULT " + c.column_default : ""}`,
    );
  }

  const indexes = await run(
    `SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND tablename IN ('agent_conversations', 'agent_messages') ORDER BY indexname`,
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