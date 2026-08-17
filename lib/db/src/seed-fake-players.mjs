// Seeds fake test players and registers them in ALL existing tournaments
// so the admin can test match generation, fixtures, standings, and brackets.
// Safe to re-run: skips players/participants that already exist.
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

const FAKE_PLAYERS = [
  "TestPlayer_01", "TestPlayer_02", "TestPlayer_03", "TestPlayer_04",
  "TestPlayer_05", "TestPlayer_06", "TestPlayer_07", "TestPlayer_08",
  "TestPlayer_09", "TestPlayer_10", "TestPlayer_11", "TestPlayer_12",
  "TestPlayer_13", "TestPlayer_14", "TestPlayer_15", "TestPlayer_16",
];

async function main() {
  const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: true } });
  try {
    await client.connect();
  } catch (err) {
    console.error("Could not connect:", err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  // ── 1. Insert fake players (skip existing) ──
  console.log(`Creating up to ${FAKE_PLAYERS.length} fake players...`);
  const playerIds = [];
  for (const username of FAKE_PLAYERS) {
    // Insert if not exists, then fetch id
    await client.query(
      `INSERT INTO players (username, display_name, role, is_active, profile_complete)
       VALUES ($1, $1, 'player', true, false)
       ON CONFLICT (username) DO NOTHING`,
      [username],
    );
    const res = await client.query(`SELECT id FROM players WHERE username = $1`, [username]);
    if (res.rows[0]) playerIds.push({ id: res.rows[0].id, username });
  }
  console.log(`  ✓ ${playerIds.length} fake players ready (ids: ${playerIds.map((p) => p.id).join(", ")})`);

  // ── 2. Get all tournaments ──
  const { rows: tournaments } = await client.query(
    `SELECT id, name, max_participants, tournament_type, current_participants FROM tournaments ORDER BY id;`,
  );
  console.log(`\nFound ${tournaments.length} tournament(s):`);
  for (const t of tournaments) {
    console.log(`  - #${t.id} "${t.name}" (type=${t.tournament_type}, max=${t.max_participants}, current=${t.current_participants})`);
  }

  if (tournaments.length === 0) {
    console.log("\nNo tournaments found. Create a tournament first.");
    await client.end();
    return;
  }

  // ── 3. Register players in each tournament ──
  let totalRegistered = 0;
  for (const t of tournaments) {
    if (t.tournament_type === "team") {
      console.log(`\n  Skipping #${t.id} "${t.name}" (team tournament — uses teams, not players)`);
      continue;
    }

    // How many already registered?
    const { rows: existing } = await client.query(
      `SELECT COUNT(*)::int AS cnt FROM tournament_participants WHERE tournament_id = $1`,
      [t.id],
    );
    const already = existing[0].cnt;
    const max = t.max_participants || 16;
    const slotsLeft = Math.max(0, max - already);

    // Only register enough to fill up to max (or all 16 if unlimited)
    const toRegister = slotsLeft === 0 ? [] : playerIds.slice(0, Math.min(slotsLeft, playerIds.length));

    if (toRegister.length === 0) {
      console.log(`\n  #${t.id} "${t.name}" — already full (${already}/${max}), skipping`);
      continue;
    }

    let added = 0;
    for (const p of toRegister) {
      // Skip if already registered
      const dup = await client.query(
        `SELECT 1 FROM tournament_participants WHERE tournament_id = $1 AND player_id = $2`,
        [t.id, p.id],
      );
      if (dup.rows.length > 0) continue;

      await client.query(
        `INSERT INTO tournament_participants (tournament_id, type, player_id)
         VALUES ($1, 'player', $2)`,
        [t.id, p.id],
      );
      added++;
    }

    // Update current_participants count
    const { rows: countRes } = await client.query(
      `SELECT COUNT(*)::int AS cnt FROM tournament_participants WHERE tournament_id = $1`,
      [t.id],
    );
    await client.query(
      `UPDATE tournaments SET current_participants = $1 WHERE id = $2`,
      [countRes[0].cnt, t.id],
    );

    totalRegistered += added;
    console.log(`\n  #${t.id} "${t.name}" — registered ${added} players (total now: ${countRes[0].cnt}/${max})`);
  }

  console.log(`\n══════════════════════════════════════════`);
  console.log(`Done! Registered ${totalRegistered} participant entries across ${tournaments.length} tournament(s).`);
  console.log(`You can now go to Admin → Matches → Generate to create fixtures.`);
  console.log(`══════════════════════════════════════════`);

  await client.end();
}

main().catch((err) => {
  console.error("Unexpected error:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
