// Applies the additive team-role migration (president_id) to the SAME Neon
// production database used by the live app. Safe: only adds the column if
// missing and backfills existing teams. Never prints the connection string.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const log = (...args) => process.stderr.write(args.join(" ") + "\n");

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

async function main() {
  const url = loadEnv();
  log("url loaded:", url.length > 0);
  if (!url) throw new Error("DATABASE_URL is not set");

  const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: true } });
  await client.connect();
  log("Connected to:", (await client.query("SELECT current_database() db")).rows[0].db);

  const stmts = [
    `ALTER TABLE "teams" ADD COLUMN IF NOT EXISTS "president_id" integer;`,
    `UPDATE "teams" SET "president_id" = COALESCE("coach_id", "captain_id") WHERE "president_id" IS NULL;`,
  ];
  for (const sql of stmts) {
    try {
      await client.query(sql);
      log("OK:", sql.substring(0, 60).replace(/\s+/g, " "));
    } catch (err) {
      log("FAILED:", sql.substring(0, 60).replace(/\s+/g, " "), "-", err && err.message);
    }
  }

  const { rows: cols } = await client.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name='teams' AND column_name='president_id'`,
  );
  const { rows: missing } = await client.query(
    `SELECT count(*)::int n FROM teams WHERE president_id IS NULL`,
  );
  const { rows: assigned } = await client.query(
    `SELECT count(*)::int n FROM teams WHERE president_id IS NOT NULL`,
  );
  log("president_id column present:", cols.length > 0);
  log("teams with president assigned:", assigned[0].n, "| without:", missing[0].n);
  await client.end();
}

main().then(
  () => process.stderr.write("DONE\n"),
  (err) => {
    process.stderr.write("FATAL: " + (err && err.stack ? err.stack : String(err)) + "\n");
    process.exit(1);
  },
);
