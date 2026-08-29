// Seeds fake test teams (clans) and registers them in ALL existing team tournaments
// so the admin can test clan match generation, table rounds, and knock-out brackets.
// Safe to re-run: skips teams/captains/participants that already exist.
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
        const m = line.match(/^\s*(?:DATABASE_URL|NEON_DATABASE_URL)\s*=\s*"?(.*?)"?\s*$/);
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

const FAKE_TEAMS = [
  { name: "Mogadishu Lions",     tag: "MGL" },
  { name: "Hargeisa Hawks",      tag: "HGH" },
  { name: "Bosaso Wolves",       tag: "BSW" },
  { name: "Kismayo Kings",       tag: "KMK" },
  { name: "Berbera Sharks",      tag: "BBS" },
  { name: "Galkayo Gladiators",  tag: "GLG" },
  { name: "Baidoa Falcons",      tag: "BDF" },
  { name: "Djibouti Dynamo",     tag: "DJD" },
  { name: "Horn Eagles",         tag: "HNE" },
  { name: "Red Sea Rovers",      tag: "RSR" },
  { name: "Nomad Knights",       tag: "NMK" },
  { name: "Cameleon United",     tag: "CMU" },
  { name: "Sheikh Storm",        tag: "SST" },
  { name: "Jubba Titans",        tag: "JBT" },
  { name: "Shabelle Strikers",   tag: "SBS" },
  { name: "Cal Madow Rangers",   tag: "CMR" },
  { name: "Dhulka Warriors",     tag: "DLW" },
  { name: "Puntland Panthers",   tag: "PLP" },
  { name: "Banadir Bengals",     tag: "BNB" },
  { name: "Sahra Sabres",        tag: "SRS" },
];

async function main() {
  const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: true } });
  try {
    await client.connect();
  } catch (err) {
    console.error("Could not connect:", err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  // ── 1. Insert fake teams (each with a captain player, skip existing) ──
  console.log(`Creating up to ${FAKE_TEAMS.length} fake teams...`);
  const teamIds = [];
  for (const t of FAKE_TEAMS) {
    const captainUsername = `Captain_${t.tag}`;
    await client.query(
      `INSERT INTO players (username, display_name, role, is_active, profile_complete)
       VALUES ($1, $1, 'player', true, false)
       ON CONFLICT (username) DO NOTHING`,
      [captainUsername],
    );
    const cap = await client.query(`SELECT id FROM players WHERE username = $1`, [captainUsername]);
    const captainId = cap.rows[0].id;

    await client.query(
      `INSERT INTO teams (name, tag, captain_id, description)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (name) DO NOTHING`,
      [t.name, t.tag, captainId, `Test clan team seeded for tournament testing.`],
    );
    const res = await client.query(`SELECT id FROM teams WHERE name = $1`, [t.name]);
    if (res.rows[0]) teamIds.push({ id: res.rows[0].id, name: t.name });
  }
  console.log(`  ✓ ${teamIds.length} fake teams ready (ids: ${teamIds.map((t) => t.id).join(", ")})`);

  // ── 2. Get all team tournaments ──
  const { rows: tournaments } = await client.query(
    `SELECT id, name, max_participants, current_participants FROM tournaments WHERE tournament_type = 'team' ORDER BY id;`,
  );
  console.log(`\nFound ${tournaments.length} team tournament(s).`);
  if (tournaments.length === 0) {
    console.log("No team tournaments found. Create one first, then re-run this script.");
    await client.end();
    return;
  }

  // ── 3. Register teams in each team tournament ──
  let totalRegistered = 0;
  for (const t of tournaments) {
    const { rows: existing } = await client.query(
      `SELECT COUNT(*)::int AS cnt FROM tournament_participants WHERE tournament_id = $1`,
      [t.id],
    );
    const already = existing[0].cnt;
    const max = t.max_participants || 16;
    const slotsLeft = Math.max(0, max - already);
    const toRegister = slotsLeft === 0 ? [] : teamIds.slice(0, Math.min(slotsLeft, teamIds.length));

    if (toRegister.length === 0) {
      console.log(`  #${t.id} "${t.name}" — already full (${already}/${max}), skipping`);
      continue;
    }

    let added = 0;
    for (const team of toRegister) {
      const dup = await client.query(
        `SELECT 1 FROM tournament_participants WHERE tournament_id = $1 AND team_id = $2`,
        [t.id, team.id],
      );
      if (dup.rows.length > 0) continue;

      await client.query(
        `INSERT INTO tournament_participants (tournament_id, type, team_id)
         VALUES ($1, 'team', $2)`,
        [t.id, team.id],
      );
      added++;
    }

    const { rows: countRes } = await client.query(
      `SELECT COUNT(*)::int AS cnt FROM tournament_participants WHERE tournament_id = $1`,
      [t.id],
    );
    await client.query(`UPDATE tournaments SET current_participants = $1 WHERE id = $2`, [countRes[0].cnt, t.id]);

    totalRegistered += added;
    console.log(`  #${t.id} "${t.name}" — registered ${added} teams (total now: ${countRes[0].cnt}/${max})`);
  }

  console.log(`\n══════════════════════════════════════════`);
  console.log(`Done! ${teamIds.length} fake teams ready, ${totalRegistered} registered across ${tournaments.length} team tournament(s).`);
  console.log(`Go to Admin → Matches → Generate Match (Clan Teams) to create the table rounds.`);
  console.log(`══════════════════════════════════════════`);

  await client.end();
}

main().catch((err) => {
  console.error("Unexpected error:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});