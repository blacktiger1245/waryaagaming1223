// Applies the additive team-member-device migration to the SAME Neon production
// database used by the live app. Safe: only creates the table + unique index if
// missing. Never prints the connection string.
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
    `CREATE TABLE IF NOT EXISTS "team_member_devices" (
       id serial PRIMARY KEY,
       player_id integer NOT NULL REFERENCES "players"(id) ON DELETE CASCADE,
       team_id integer NOT NULL REFERENCES "teams"(id) ON DELETE CASCADE,
       device_name text NOT NULL,
       serial_number text NOT NULL,
       screenshot_path text NOT NULL,
       status text NOT NULL DEFAULT 'pending',
       created_at timestamp NOT NULL DEFAULT now()
     );`,
    `ALTER TABLE "team_member_devices"
       ADD COLUMN IF NOT EXISTS "status" text NOT NULL DEFAULT 'pending';`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "team_member_devices_player_unique"
       ON "team_member_devices" ("player_id");`,
  ];
  for (const sql of stmts) {
    try {
      await client.query(sql);
      log("OK:", sql.substring(0, 60).replace(/\s+/g, " "));
    } catch (err) {
      log("FAILED:", sql.substring(0, 60).replace(/\s+/g, " "), "-", err && err.message);
    }
  }

  const { rows: hasTable } = await client.query(
    `SELECT to_regclass('public.team_member_devices') AS t`,
  );
  const { rows: count } = await client.query(
    `SELECT count(*)::int n FROM "team_member_devices"`,
  );
  log("table present:", !!hasTable[0]?.t);
  log("rows in team_member_devices:", count[0].n);
  await client.end();
}

main().then(
  () => process.stderr.write("DONE\n"),
  (err) => {
    process.stderr.write("FATAL: " + (err && err.stack ? err.stack : String(err)) + "\n");
    process.exit(1);
  },
);