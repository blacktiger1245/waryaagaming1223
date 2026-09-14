// Seeds the canonical "Regional Finals" upcoming fixture shown on the fixtures
// dashboard: Waryaa United vs Guardians FC, scheduled for 14 September 2026
// 13:03 East Africa Time (= 10:03 UTC) in the "clans" tournament (#39).
//
// Idempotent and safe to re-run: it only ever updates the single Waryaa United
// vs Guardians FC match row in tournament 39 (creating it if it is missing).
// It never touches any other match, result, or team.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
function loadEnv() {
  let dir = __dirname;
  for (let i = 0; i < 6; i++) {
    const f = path.join(dir, ".env");
    if (fs.existsSync(f)) {
      const raw = fs.readFileSync(f, "utf8");
      const m = raw.split("\n").map((l) => l.trim()).find((l) => l.startsWith("DATABASE_URL"));
      if (m) return m.split("=").slice(1).join("=").replace(/^"|"$/g, "");
    }
    dir = path.dirname(dir);
  }
  return process.env.DATABASE_URL || "";
}
const url = loadEnv();
if (!url) { console.error("DATABASE_URL not set. No changes were made."); process.exit(1); }

const TOURNAMENT_ID = 39;
const HOME_NAME = "Waryaa United";   // team id 44
const AWAY_NAME = "Guardians FC";    // team id 55
const SCHEDULED_AT = "2026-09-14T10:03:00Z"; // 13:03 EAT — matches the design fixture
const ROUND_NAME = "Round 1";

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();

try {
  const [tourney] = (await client.query(`SELECT id, name FROM tournaments WHERE id = $1`, [TOURNAMENT_ID])).rows;
  if (!tourney) throw new Error(`Tournament ${TOURNAMENT_ID} not found.`);

  const home = (await client.query(`SELECT id FROM teams WHERE name = $1`, [HOME_NAME])).rows[0];
  const away = (await client.query(`SELECT id FROM teams WHERE name = $1`, [AWAY_NAME])).rows[0];
  if (!home || !away) throw new Error(`Could not resolve teams: ${HOME_NAME}=${home?.id} ${AWAY_NAME}=${away?.id}`);

  // Find the existing Waryaa United (home) vs Guardians FC match in this tournament.
  const existing = (await client.query(
    `SELECT id, status, scheduled_at FROM matches
     WHERE tournament_id = $1 AND participant1_id = $2 AND participant2_id = $3
     ORDER BY id LIMIT 1`,
    [TOURNAMENT_ID, home.id, away.id],
  )).rows[0];

  if (existing) {
    await client.query(
      `UPDATE matches
       SET scheduled_at = $1, status = 'scheduled', round_name = $2,
           participant1_name = $3, participant2_name = $4
       WHERE id = $5`,
      [SCHEDULED_AT, ROUND_NAME, HOME_NAME, AWAY_NAME, existing.id],
    );
    console.log(`Updated existing fixture: match #${existing.id} (${HOME_NAME} vs ${AWAY_NAME}) → ${SCHEDULED_AT}`);
  } else {
    const ins = (await client.query(
      `INSERT INTO matches (tournament_id, round, round_name, stage, status,
         participant1_id, participant1_name, participant2_id, participant2_name, scheduled_at)
       VALUES ($1, 1, $2, 1, 'scheduled', $3, $4, $5, $6, $7)
       RETURNING id`,
      [TOURNAMENT_ID, ROUND_NAME, home.id, HOME_NAME, away.id, AWAY_NAME, SCHEDULED_AT],
    )).rows[0];
    console.log(`Created fixture: match #${ins.id} (${HOME_NAME} vs ${AWAY_NAME}) → ${SCHEDULED_AT}`);
  }
} finally {
  await client.end();
}