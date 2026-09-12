// Seeds tournament #39 "clans" with 12 teams, each with 6 players (drawn from
// the pool of free-agent players). Creates the 12 clans, assigns 6 players to
// each, sets a captain per clan, and enrolls the 12 clans as participants.
// One-off runnable script; never prints the connection string.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
function loadEnv() {
  for (const p of [path.join(__dirname, "..", "..", "..", ".env"), path.join(__dirname, "..", "..", ".env"), path.join(__dirname, ".env")]) {
    if (!fs.existsSync(p)) continue;
    const raw = fs.readFileSync(p, "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^\s*(?:DATABASE_URL|NEON_DATABASE_URL)\s*=\s*"?(.*?)"?\s*$/);
      if (m && m[1]) return m[1];
    }
  }
  return process.env.DATABASE_URL || process.env.NEON_DATABASE_URL || "";
}
const url = loadEnv();
if (!url) {
  console.error("DATABASE_URL is not set. No changes were made.");
  process.exit(1);
}

const TOURNAMENT_ID = 39;
const TEAMS_PER = 6;

const TEAMS = [
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

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: true } });
await client.connect();

// Sanity checks
const [tourney] = (await client.query(`SELECT id, current_participants FROM tournaments WHERE id = $1`, [TOURNAMENT_ID])).rows;
if (!tourney) {
  console.error(`Tournament ${TOURNAMENT_ID} not found.`);
  await client.end();
  process.exit(1);
}

const existingParts = await client.query(
  `SELECT count(*)::int AS n FROM tournament_participants WHERE tournament_id = $1`,
  [TOURNAMENT_ID],
);
if (existingParts.rows[0].n > 0) {
  console.error(`Tournament ${TOURNAMENT_ID} already has ${existingParts.rows[0].n} participants. Aborting.`);
  await client.end();
  process.exit(1);
}

// Gather 12*6 = 72 free-agent players (unassigned) ordered by id; skip used ones.
const needPlayers = TEAMS.length * TEAMS_PER;
const fa = await client.query(
  `SELECT id FROM players
   WHERE team_id IS NULL OR team_id = 0
   ORDER BY id
   LIMIT $1`,
  [needPlayers],
);
if (fa.rows.length < needPlayers) {
  console.error(`Only ${fa.rows.length} free agents available, need ${needPlayers}. Aborting.`);
  await client.end();
  process.exit(1);
}
for (const r of fa.rows) {
  void r;
}
const freeIds = fa.rows.map((r) => r.id);

// Guard: don't reuse a player already linked somewhere (captains etc.) — keep simple:
// free agents with no team only.

const partRows = [];
for (let i = 0; i < TEAMS.length; i++) {
  const team = TEAMS[i];
  const roster = freeIds.slice(i * TEAMS_PER, i * TEAMS_PER + TEAMS_PER);
  const captainId = roster[0];

  const [created] = (await client.query(
    `INSERT INTO teams (name, tag, division, captain_id, wins, losses, points, achievements)
     VALUES ($1, $2, 'serie_a', $3, 0, 0, 0, '{}')
     RETURNING id`,
    [team.name, team.tag, captainId],
  )).rows;
  const teamId = created.id;

  // Assign the 6 players to this clan.
  await client.query(`UPDATE players SET team_id = $1 WHERE id = ANY($2)`, [teamId, roster]);

  partRows.push(teamId);
  console.log(`Created clan #${teamId} ${team.name} (${roster.length} players, captain #${captainId})`);
}

// Enroll the 12 clans into the tournament (type 'team').
for (const teamId of partRows) {
  await client.query(
    `INSERT INTO tournament_participants (tournament_id, type, player_id, team_id, seed)
     VALUES ($1, 'team', NULL, $2, NULL)`,
    [TOURNAMENT_ID, teamId],
  );
}

await client.query(`UPDATE tournaments SET current_participants = $1 WHERE id = $2`, [TEAMS.length, TOURNAMENT_ID]);

console.log(`Enrolled ${partRows.length} clans into tournament #${TOURNAMENT_ID}. current_participants = ${TEAMS.length}`);
await client.end();
