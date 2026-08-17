// Applies additive column fixes for the tournament creation flow.
// Safe: only adds columns/tables that are missing (IF NOT EXISTS).
// Never prints the connection string or password.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  // Walk up from this file to find a .env
  let dir = __dirname;
  for (let i = 0; i < 5; i++) {
    const p = path.join(dir, ".env");
    if (fs.existsSync(p)) {
      const raw = fs.readFileSync(p, "utf8");
      for (const line of raw.split("\n")) {
        const m = line.match(/^\s*DATABASE_URL\s*=\s*"?(.*?)"?\s*$/);
        if (m && m[1]) return m[1];
      }
    }
    dir = path.dirname(dir);
  }
  return process.env.DATABASE_URL || process.env.NEON_DATABASE_URL || "";
}

const url = loadEnv();
if (!url) {
  console.error("DATABASE_URL is not set. No changes were made.");
  process.exit(1);
}

const statements = [
  // tournament_admins.role (migration 0001) — was never applied to live DB
  `ALTER TABLE "tournament_admins" ADD COLUMN IF NOT EXISTS "role" text NOT NULL DEFAULT 'admin';`,
  // tournaments new columns (migration 0003)
  `ALTER TABLE "tournaments" ADD COLUMN IF NOT EXISTS "category_id" integer;`,
  `ALTER TABLE "tournaments" ADD COLUMN IF NOT EXISTS "group_count" integer NOT NULL DEFAULT 4;`,
  `ALTER TABLE "tournaments" ADD COLUMN IF NOT EXISTS "qualify_count" integer;`,
  `ALTER TABLE "tournaments" ADD COLUMN IF NOT EXISTS "third_place_match" boolean NOT NULL DEFAULT false;`,
];

async function main() {
  const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: true } });
  try {
    await client.connect();
  } catch (err) {
    console.error("Could not connect:", (err instanceof Error ? err.message : String(err)));
    process.exit(1);
  }

  // Inspect current state (read-only)
  const { rows: tables } = await client.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;`,
  );
  console.log("Public tables:", tables.map((r) => r.table_name).join(", "));

  const { rows: taCols } = await client.query(
    `SELECT column_name, data_type, column_default FROM information_schema.columns WHERE table_name = 'tournament_admins' ORDER BY ordinal_position;`,
  );
  console.log("\ntournament_admins columns:", taCols.map((r) => `${r.column_name}(${r.data_type})`).join(", "));

  const { rows: tCols } = await client.query(
    `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'tournaments' ORDER BY ordinal_position;`,
  );
  console.log("tournaments columns:", tCols.map((r) => `${r.column_name}(${r.data_type})`).join(", "));

  // Apply
  console.log("\nApplying additive migrations...");
  for (const sql of statements) {
    try {
      await client.query(sql);
      console.log("  ✓", sql.substring(0, 80).replace(/\s+/g, " ") + "...");
    } catch (err) {
      console.error("  ✗ FAILED:", sql.substring(0, 80).replace(/\s+/g, " "));
      console.error("    ", err instanceof Error ? err.message : String(err));
    }
  }

  // Verify
  const { rows: taCols2 } = await client.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name = 'tournament_admins' AND column_name = 'role';`,
  );
  const { rows: tCols2 } = await client.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name = 'tournaments' AND column_name IN ('category_id','qualify_count','third_place_match');`,
  );
  console.log("\nVerification:");
  console.log("  tournament_admins.role present:", taCols2.length > 0);
  console.log("  tournaments new columns:", tCols2.map((r) => r.column_name).join(", "));

  await client.end();
}

main().catch((err) => {
  console.error("Unexpected error:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
