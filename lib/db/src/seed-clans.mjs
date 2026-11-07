// Seeds the 12 tournament clans, each with a full 12-player squad.
//
// Every clan gets exactly 12 players — and the first three of those twelve are
// the clan's President, Coach and Captain (recorded on teams.president_id /
// coach_id / captain_id AND assigned to the squad via players.team_id), with the
// remaining nine making up the rest of the line-up.
//
// Idempotent: re-running only fills in whatever is missing (clans, players and
// the squad assignments are upserted), so it is safe to run more than once.
// One-off runnable script; never prints the connection string.
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

// 12 clans. Each is seeded with a 12-player squad (President, Coach, Captain +
// 9 more players) — see PLAYERS_PER_CLAN below.
const CLANS = [
  { name: "Waryaa United", tag: "WYU" },
  { name: "Somali Hawks", tag: "SMH" },
  { name: "Desert Scorpions", tag: "DSC" },
  { name: "Blue Nile FC", tag: "BNF" },
  { name: "Golden Lions", tag: "GDL" },
  { name: "Aksum Kings", tag: "AKS" },
  { name: "Crimson Eagles", tag: "CME" },
  { name: "Sahara Storm", tag: "SHS" },
  { name: "Nile Crocodiles", tag: "NLC" },
  { name: "Highland Warriors", tag: "HLW" },
  { name: "Lion Hearts", tag: "LNH" },
  { name: "Guardians FC", tag: "GRD" },
];

// 12 players per clan: the first three are the leadership (President, Coach,
// Captain), the remaining nine are the squad.
const PLAYERS_PER_CLAN = 12;
const LEADER_LABELS = ["President", "Coach", "Captain"];

async function main() {
  const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: true } });
  try {
    await client.connect();
  } catch (err) {
    console.error("Could not connect:", err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  console.log(`Seeding ${CLANS.length} clans with ${PLAYERS_PER_CLAN} players each...\n`);

  let createdTeams = 0;
  let createdPlayers = 0;

  for (const clan of CLANS) {
    // ── 1. Create the clan's 12 players (leadership first) ──
    const squadIds = [];
    for (let i = 0; i < PLAYERS_PER_CLAN; i++) {
      const isLeader = i < LEADER_LABELS.length;
      const label = isLeader ? LEADER_LABELS[i] : `P${i - LEADER_LABELS.length + 1}`;
      const username = `${clan.tag}_${label}`;
      const displayName = `${clan.name} ${label}`;

      const ins = await client.query(
        `INSERT INTO players (username, display_name, role, is_active, profile_complete, country)
         VALUES ($1, $2, 'player', true, false, 'SO')
         ON CONFLICT (username) DO NOTHING
         RETURNING id`,
        [username, displayName],
      );
      if (ins.rows[0]) createdPlayers++;

      const found = await client.query(`SELECT id FROM players WHERE username = $1`, [username]);
      squadIds.push(found.rows[0].id);
    }

    const [presidentId, coachId, captainId] = squadIds;

    // ── 2. Create the clan (or reuse it) with its leadership wired up ──
    const insTeam = await client.query(
      `INSERT INTO teams (name, tag, division, president_id, coach_id, captain_id, description)
       VALUES ($1, $2, 'serie_a', $3, $4, $5, $6)
       ON CONFLICT (name) DO NOTHING
       RETURNING id`,
      [
        clan.name,
        clan.tag,
        presidentId,
        coachId,
        captainId,
        "Seeded clan with a full 12-player squad (President, Coach, Captain + 9 players).",
      ],
    );
    if (insTeam.rows[0]) createdTeams++;

    const teamRow = await client.query(`SELECT id FROM teams WHERE name = $1`, [clan.name]);
    const teamId = teamRow.rows[0].id;

    // Ensure leadership is set even if the clan already existed without it.
    await client.query(
      `UPDATE teams
         SET president_id = COALESCE(president_id, $2),
             coach_id     = COALESCE(coach_id, $3),
             captain_id   = COALESCE(captain_id, $4)
       WHERE id = $1`,
      [teamId, presidentId, coachId, captainId],
    );

    // ── 3. Assign the whole 12-player squad to the clan ──
    await client.query(`UPDATE players SET team_id = $1 WHERE id = ANY($2)`, [teamId, squadIds]);

    console.log(
      `  ✓ ${clan.name} (#${teamId}) — 12 players ` +
        `(President #${presidentId}, Coach #${coachId}, Captain #${captainId})`,
    );
  }

  console.log(`\n══════════════════════════════════════════`);
  console.log(`Done! ${CLANS.length} clans ready (${createdTeams} newly created, ${createdPlayers} new players).`);
  console.log(`Open Admin → Matches → a clan tournament → "Seed Clans" to register them and fill each`);
  console.log(`clan's line-up up to the player-vs-player limit set when the tournament was created.`);
  console.log(`══════════════════════════════════════════`);

  await client.end();
}

main().catch((err) => {
  console.error("Unexpected error:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
