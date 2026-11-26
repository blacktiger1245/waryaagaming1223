// Seeds an EXISTING clan tournament — found by name — with clans and players.
//
// Defaults: tournament named "f", 8 clans, 4 players per clan (32 players).
// Reuses free-agent players first and only creates players when the free-agent
// pool runs short. Each clan is enrolled as a tournament participant (type
// 'team') and its player-vs-player line-up is written to tournament_team_rosters.
//
// Idempotent and safe to re-run: clans, players and participant/line-up rows
// that already exist are reused rather than duplicated. Never prints the
// connection string.
//
// Usage:
//   node lib/db/src/seed-tournament-clans.mjs            # "f", 8 clans x 4 players
//   node lib/db/src/seed-tournament-clans.mjs f 8 4      # name / clans / players per clan
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  for (const p of [
    path.join(__dirname, "..", "..", "..", ".env"),
    path.join(__dirname, "..", "..", ".env"),
    path.join(__dirname, ".env"),
  ]) {
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

// ── Parameters: tournament name, clan count, players per clan ─────────────────
const TOURNAMENT_NAME = (process.argv[2] || "f").trim();
const CLAN_COUNT = Math.max(1, Number.parseInt(process.argv[3] ?? "8", 10) || 8);
const PLAYERS_PER_CLAN = Math.max(1, Number.parseInt(process.argv[4] ?? "4", 10) || 4);

// ── The clans to create (name + tag). Extend the pool if CLAN_COUNT > 12. ─────
const CLAN_POOL = [
  { name: "Waryaa Sharks", tag: "WYS" },
  { name: "Hargeisa Titans", tag: "HGT" },
  { name: "Mogadishu Storm", tag: "MGS" },
  { name: "Berbera Blades", tag: "BBB" },
  { name: "Kismayo Kraken", tag: "KSK" },
  { name: "Bosaso Bulls", tag: "BSB" },
  { name: "Baidoa Bolt", tag: "BDB" },
  { name: "Garowe Guardians", tag: "GRG" },
  { name: "Jubba Jaguars", tag: "JBJ" },
  { name: "Shabelle Sharks", tag: "SBS" },
  { name: "Nugaal Nomads", tag: "NGN" },
  { name: "Sanaag Sentinels", tag: "SNS" },
];

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: true } });

async function main() {
  await client.connect();

  // ── 1. Resolve the (already-created) tournament by name ────────────────────
  const { rows: matches } = await client.query(
    `SELECT id, name, tournament_type, is_clan_tournament, max_participants,
            team_count, players_per_team, current_participants
       FROM tournaments
      WHERE lower(name) = lower($1)
      ORDER BY id`,
    [TOURNAMENT_NAME],
  );

  if (matches.length === 0) {
    console.error(`No tournament named "${TOURNAMENT_NAME}" was found. Create it first, then re-run.`);
    return;
  }
  if (matches.length > 1) {
    console.warn(`Warning: ${matches.length} tournaments named "${TOURNAMENT_NAME}" — using #${matches[0].id}.`);
  }
  const tournament = matches[0];
  const tournamentId = tournament.id;
  console.log(
    `Tournament #${tournamentId} "${tournament.name}" found ` +
      `(type=${tournament.tournament_type}, clan=${tournament.is_clan_tournament}).`,
  );

  // ── 2. Create each clan, its squad, and enroll it ─────────────────────────
  if (CLAN_COUNT > CLAN_POOL.length) {
    console.warn(`Only ${CLAN_POOL.length} clan names are defined; creating ${CLAN_POOL.length}, not ${CLAN_COUNT}.`);
  }
  const clans = CLAN_POOL.slice(0, CLAN_COUNT);
  let createdClans = 0;
  let createdPlayers = 0;
  let enrolments = 0;

  for (const { name, tag } of clans) {
    // Find-or-create the clan (teams.name is unique).
    let teamId;
    const found = await client.query(`SELECT id FROM teams WHERE name = $1`, [name]);
    if (found.rows[0]) {
      teamId = found.rows[0].id;
    } else {
      const inserted = await client.query(
        `INSERT INTO teams (name, tag, division, wins, losses, points, achievements, description)
         VALUES ($1, $2, 'serie_a', 0, 0, 0, '{}', $3)
         RETURNING id`,
        [name, tag, `Seeded clan for tournament "${tournament.name}".`],
      );
      teamId = inserted.rows[0].id;
      createdClans += 1;
    }

    // Existing squad first, then top up from the free-agent pool.
    let roster = (await client.query(`SELECT id FROM players WHERE team_id = $1 ORDER BY id`, [teamId])).rows.map(
      (r) => r.id,
    );

    if (roster.length < PLAYERS_PER_CLAN) {
      const need = PLAYERS_PER_CLAN - roster.length;
      const freeAgents = (
        await client.query(
          `SELECT id FROM players
            WHERE (team_id IS NULL OR team_id = 0) AND is_active = true
            ORDER BY id
            LIMIT $1`,
          [need],
        )
      ).rows.map((r) => r.id);
      if (freeAgents.length > 0) {
        await client.query(`UPDATE players SET team_id = $1 WHERE id = ANY($2)`, [teamId, freeAgents]);
        roster = roster.concat(freeAgents);
      }
    }

    // Create brand-new players for whatever is still missing.
    let nextIndex = roster.length;
    while (roster.length < PLAYERS_PER_CLAN) {
      nextIndex += 1;
      const username = `${tag}_p${nextIndex}`;
      await client.query(
        `INSERT INTO players (username, display_name, role, is_active, profile_complete, country, team_id)
         VALUES ($1, $2, 'player', true, false, 'SO', $3)
         ON CONFLICT (username) DO NOTHING`,
        [username, `${name} P${nextIndex}`, teamId],
      );
      const row = (await client.query(`SELECT id, team_id FROM players WHERE username = $1`, [username])).rows[0];
      if (!row) {
        console.error(`Could not create player "${username}" — skipping.`);
        break;
      }
      if (row.team_id == null || row.team_id === 0) {
        await client.query(`UPDATE players SET team_id = $1 WHERE id = $2`, [teamId, row.id]);
      } else if (row.team_id !== teamId) {
        console.warn(`  ! "${username}" already belongs to team #${row.team_id} — trying another name.`);
        continue;
      }
      if (!roster.includes(row.id)) {
        roster.push(row.id);
        createdPlayers += 1;
      }
    }
    roster = roster.slice(0, PLAYERS_PER_CLAN);

    // Captain + President = first player of the line-up (only fills empty seats).
    const leaderId = roster[0];
    await client.query(
      `UPDATE teams
          SET captain_id = COALESCE(captain_id, $1),
              president_id = COALESCE(president_id, $1)
        WHERE id = $2`,
      [leaderId, teamId],
    );

    // Enroll the clan as a team participant (exactly once).
    const dup = await client.query(
      `SELECT id FROM tournament_participants WHERE tournament_id = $1 AND team_id = $2`,
      [tournamentId, teamId],
    );
    if (!dup.rows[0]) {
      await client.query(
        `INSERT INTO tournament_participants (tournament_id, type, player_id, team_id, seed)
         VALUES ($1, 'team', NULL, $2, NULL)`,
        [tournamentId, teamId],
      );
      enrolments += 1;
    }

    // Player-vs-player line-up for this clan (idempotent via unique key).
    for (const playerId of roster) {
      await client.query(
        `INSERT INTO tournament_team_rosters (tournament_id, team_id, player_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (tournament_id, team_id, player_id) DO NOTHING`,
        [tournamentId, teamId, playerId],
      );
    }

    console.log(`  ✓ Clan #${teamId} "${name}" (${roster.length}/${PLAYERS_PER_CLAN} players, captain #${leaderId})`);
  }

  // ── 3. Flip the tournament into clan mode and resync its counters ──────────
  const finalCount = (
    await client.query(`SELECT count(*)::int AS n FROM tournament_participants WHERE tournament_id = $1`, [tournamentId])
  ).rows[0].n;

  await client.query(
    `UPDATE tournaments
        SET current_participants = $1,
            is_clan_tournament = true,
            tournament_type = 'team',
            team_count = $1,
            players_per_team = COALESCE(NULLIF(players_per_team, 0), $2)
      WHERE id = $3`,
    [finalCount, PLAYERS_PER_CLAN, tournamentId],
  );

  console.log(`\n──────────────────────────────────────────────`);
  console.log(`Tournament #${tournamentId} "${tournament.name}"`);
  console.log(`  clans created:   ${createdClans}`);
  console.log(`  players created: ${createdPlayers}`);
  console.log(`  clans enrolled:  ${enrolments} (of ${clans.length} requested)`);
  console.log(`  participants:    ${finalCount} (each clan has ${PLAYERS_PER_CLAN} players)`);
  console.log(`──────────────────────────────────────────────`);
}

main()
  .catch((err) => {
    console.error("Unexpected error:", err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.end().catch(() => {});
  });
