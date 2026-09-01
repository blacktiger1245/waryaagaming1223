// Creates the academy_posts table if it does not exist (replaces academy_sections).
import pg from "pg";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Walk up to the repo root to find .env (same approach as seed-fake-teams.mjs)
let dir = __dirname, connectionString = "";
for (let i = 0; i < 6; i++) {
  const p = path.join(dir, ".env");
  if (fs.existsSync(p)) {
    const m = fs.readFileSync(p, "utf8").match(/^\s*(?:DATABASE_URL|NEON_DATABASE_URL)\s*=\s*"?(.*?)"?\s*$/m);
    if (m) { connectionString = m[1]; break; }
  }
  dir = path.dirname(dir);
}
connectionString = connectionString || process.env.DATABASE_URL || process.env.NEON_DATABASE_URL || "";

if (!connectionString) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: true } });
await client.connect();

await client.query(`
  CREATE TABLE IF NOT EXISTS academy_posts (
    id SERIAL PRIMARY KEY,
    category TEXT NOT NULL DEFAULT 'player_training',
    title TEXT NOT NULL,
    body TEXT NOT NULL DEFAULT '',
    image_url TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_published BOOLEAN NOT NULL DEFAULT TRUE,
    updated_by TEXT,
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
  );
`);

console.log("✓ academy_posts table ready");
await client.end();