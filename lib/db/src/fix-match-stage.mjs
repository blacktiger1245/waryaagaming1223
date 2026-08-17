// Applies the additive "matches.stage" column needed for the two-stage
// (Group Stage + Knock-out) tournament flow. Safe: only adds the column if
// missing and backfills existing knockout rows. Never prints the connection
// string or password.
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
  `ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "stage" integer NOT NULL DEFAULT 1;`,
  `UPDATE "matches" SET "stage" = 2
    WHERE "round_name" ~* '(Quarter Finals|Semi Finals|Final|Round of|Third Place)';`,
];

async function main() {
  const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: true } });
  try {
    await client.connect();
  } catch (err) {
    console.error("Could not connect:", err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  console.log("Applying matches.stage migration...");
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
    `SELECT column_name, data_type, column_default FROM information_schema.columns WHERE table_name = 'matches' AND column_name = 'stage';`,
  );
  const { rows: counts } = await client.query(
    `SELECT stage, count(*) AS n FROM "matches" GROUP BY stage ORDER BY stage;`,
  );
  console.log("\nVerification:");
  console.log("  matches.stage present:", cols.length > 0, cols[0] ? `(${cols[0].data_type}, default ${cols[0].column_default})` : "");
  console.log("  stage distribution:", counts.map((r) => `stage=${r.stage}: ${r.n}`).join(" · "));

  await client.end();
}

main().catch((err) => {
  console.error("Unexpected error:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
