// Applies the additive bracket-relationship columns needed for correct
// Stage 2 Knock-out progression (QF → SF → Final) on the the SAME Neon
// production database used by the live app. Safe: only adds columns if they
// are missing. Never prints the connection string or password.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadEnv() {
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
  `ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "parent_match1_id" integer;`,
  `ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "parent_match2_id" integer;`,
  `ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "next_match_id" integer;`,
  `ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "next_slot" integer;`,
];

async function main() {
  const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: true } });
  try {
    await client.connect();
  } catch (err) {
    console.error("Could not connect:", err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  console.log("Applying matches bracket-relationship migration...");
  for (const sql of statements) {
    try {
      await client.query(sql);
      console.log("  ✓", sql.substring(0, 80).replace(/\s+/g, " ") + "...");
    } catch (err) {
      console.error("  ✗ FAILED:", sql.substring(0, 80).replace(/\s+/g, " "));
      console.error("    ", err instanceof Error ? err.message : String(err));
    }
  }

  const { rows: cols } = await client.query(
    `SELECT column_name FROM information_schema.columns
      WHERE table_name = 'matches'
        AND column_name IN ('parent_match1_id','parent_match2_id','next_match_id','next_slot')
      ORDER BY column_name;`,
  );
  console.log("\nVerification — matches relationship columns present:");
  console.log("  " + cols.map((r) => r.column_name).join(", ") || "  (none)");

  await client.end();
}

main().catch((err) => {
  console.error("Unexpected error:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
