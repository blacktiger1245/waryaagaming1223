// Removes the seeded/fake players, the fake test clans and the seeded test
// tournaments they were registered into, so the platform only shows real data.
//
// Real (Discord-registered) accounts are NEVER touched.
//
//   node src/remove-fake-data.mjs          -> dry run: reports exactly what
//                                             would be deleted, then ROLLS BACK
//   node src/remove-fake-data.mjs --apply  -> performs the deletion
//
// Everything runs inside ONE transaction: if any statement fails, nothing is
// changed. The script never prints the connection string.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  let dir = __dirname;
  for (let i = 0; i < 6; i++) {
    const p = path.join(dir, ".env");
    if (fs.existsSync(p)) {
      const raw = fs.readFileSync(p, "utf8");
      for (const line of raw.split("\n")) {
        const m = line.match(/^\s*(?:DATABASE_URL|NEON_DATABASE_URL)\s*=\s*"?([^"]*?)"?\s*$/);
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

const APPLY = process.argv.includes("--apply");

// ── Players created by the seed/test tooling ────────────────────────────────
// `fake_<tag>_<n>` pools, the `TestPlayer_NN` set, the `Captain_<TAG>` clan
// captains and the automated `e2e_*` fixtures. None of these can be a real
// Discord account, so matching them is safe.
const FAKE_PLAYER_REGEX = "^(fake_|TestPlayer_|Captain_|e2e_)";

// ── Teams created by the seed scripts ───────────────────────────────────────
// 1) The 20 "Test clan team seeded for tournament testing." clans.
// 2) The 12 clans created by seed-clan-tournament.mjs (rosters are fake players).
const FAKE_TEAM_DESC = "Test clan team seeded for tournament testing.";
const FAKE_TEAM_NAMES = [
  "Mogadishu Lions", "Hargeisa Hawks", "Bosaso Wolves", "Kismayo Kings",
  "Berbera Sharks", "Galkayo Gladiators", "Baidoa Falcons", "Djibouti Dynamo",
  "Horn Eagles", "Red Sea Rovers", "Nomad Knights", "Cameleon United",
  "Sheikh Storm", "Jubba Titans", "Shabelle Strikers", "Cal Madow Rangers",
  "Dhulka Warriors", "Puntland Panthers", "Banadir Bengals", "Sahra Sabres",
  "Waryaa United", "Somali Hawks", "Desert Scorpions", "Blue Nile FC",
  "Golden Lions", "Aksum Kings", "Crimson Eagles", "Sahara Storm",
  "Nile Crocodiles", "Highland Warriors", "Lion Hearts", "Guardians FC",
];

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();

const rows = async (sql, params) => (await client.query(sql, params)).rows;
const run = (sql, params) => client.query(sql, params);

const haveTable = new Set(
  (await rows(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`)).map((r) => r.table_name),
);
const columnExists = async (table, column) =>
  (await rows(
    `SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`,
    [table, column],
  )).length > 0;

const log = (s = "") => console.log(s);

try {
  await run("BEGIN");

  // ── Target sets (temp tables, dropped at commit/rollback) ─────────────────
  await run(`CREATE TEMP TABLE del_players ON COMMIT DROP AS
             SELECT id FROM players WHERE username ~ $1`, [FAKE_PLAYER_REGEX]);
  await run(`CREATE TEMP TABLE del_teams ON COMMIT DROP AS
             SELECT id FROM teams WHERE description = $1 OR name = ANY($2::text[])`,
    [FAKE_TEAM_DESC, FAKE_TEAM_NAMES]);

  // Seeded/polluted tournaments: any tournament that had a fake player or a
  // fake clan registered as a participant.
  await run(`CREATE TEMP TABLE del_tournaments ON COMMIT DROP AS
    SELECT DISTINCT t.id FROM tournaments t
    WHERE EXISTS (SELECT 1 FROM tournament_participants tp
                  WHERE tp.tournament_id = t.id
                    AND (tp.player_id IN (SELECT id FROM del_players)
                         OR tp.team_id IN (SELECT id FROM del_teams)))`);

  // Matches: those in a deleted tournament, orphaned (tournament gone), or
  // involving a fake player / fake clan.
  await run(`CREATE TEMP TABLE del_matches ON COMMIT DROP AS
    SELECT m.id FROM matches m
    WHERE m.tournament_id IN (SELECT id FROM del_tournaments)
       OR m.tournament_id NOT IN (SELECT id FROM tournaments)
       OR m.participant1_id IN (SELECT id FROM del_players)
       OR m.participant2_id IN (SELECT id FROM del_players)
       OR m.winner_id        IN (SELECT id FROM del_players)
       OR m.man_of_the_match_id IN (SELECT id FROM del_players)
       OR m.participant1_id IN (SELECT id FROM del_teams)
       OR m.participant2_id IN (SELECT id FROM del_teams)
       OR m.winner_id        IN (SELECT id FROM del_teams)`);

  const nP = (await rows(`SELECT count(*)::int n FROM del_players`))[0].n;
  const nT = (await rows(`SELECT count(*)::int n FROM del_teams`))[0].n;
  const nTr = (await rows(`SELECT count(*)::int n FROM del_tournaments`))[0].n;
  const nM = (await rows(`SELECT count(*)::int n FROM del_matches`))[0].n;

  log(`MODE: ${APPLY ? "APPLY (changes will be committed)" : "DRY RUN (rolled back)"}`);
  log(`Target fake players      : ${nP}`);
  log(`Target fake teams        : ${nT}`);
  log(`Target test tournaments  : ${nTr}`);
  log(`Target matches           : ${nM}`);
  log("");

  // Guard: no KEPT team may be captained by a fake player we are deleting.
  const orphanCaptains = await rows(`
    SELECT t.id, t.name, t.captain_id FROM teams t
    WHERE t.id NOT IN (SELECT id FROM del_teams)
      AND t.captain_id IN (SELECT id FROM del_players)`);
  if (orphanCaptains.length) {
    throw new Error(
      `Refusing to delete: ${orphanCaptains.length} surviving team(s) are captained by a fake player ` +
      `(${orphanCaptains.map((r) => `#${r.id} ${r.name} cap=${r.captain_id}`).join(", ")}). ` +
      `Add them to the fake-team list first.`,
    );
  }

  // ── Steps, children before parents ────────────────────────────────────────
  const steps = [];
  const step = (label, sql, params) => steps.push({ label, sql, params });

  // Matches + their dependent submissions / audit rows.
  step("matches", `DELETE FROM matches WHERE id IN (SELECT id FROM del_matches)`);
  if (haveTable.has("match_player_games")) {
    step("match_player_games", `DELETE FROM match_player_games
      WHERE match_id IN (SELECT id FROM del_matches)
         OR home_player_id IN (SELECT id FROM del_players)
         OR away_player_id IN (SELECT id FROM del_players)`);
  }
  if (haveTable.has("match_result_submissions")) {
    step("match_result_submissions", `DELETE FROM match_result_submissions
      WHERE fixture_id NOT IN (SELECT id FROM matches)
         OR submitted_by IN (SELECT id FROM del_players)
         OR assigned_home_player_id IN (SELECT id FROM del_players)
         OR assigned_away_player_id IN (SELECT id FROM del_players)`);
  }
  if (haveTable.has("match_result_audit_log")) {
    step("match_result_audit_log", `DELETE FROM match_result_audit_log
      WHERE fixture_id NOT IN (SELECT id FROM matches)
         OR submission_id NOT IN (SELECT id FROM match_result_submissions)
         OR admin_id IN (SELECT id FROM del_players)`);
  }

  // Tournament membership + the seeded tournaments themselves.
  if (haveTable.has("tournament_team_rosters")) {
    step("tournament_team_rosters", `DELETE FROM tournament_team_rosters
      WHERE tournament_id IN (SELECT id FROM del_tournaments)
         OR player_id IN (SELECT id FROM del_players)
         OR team_id IN (SELECT id FROM del_teams)`);
  }
  if (haveTable.has("tournament_participants")) {
    step("tournament_participants", `DELETE FROM tournament_participants
      WHERE tournament_id IN (SELECT id FROM del_tournaments)
         OR player_id IN (SELECT id FROM del_players)
         OR team_id IN (SELECT id FROM del_teams)`);
  }
  if (haveTable.has("tournament_admins")) {
    step("tournament_admins", `DELETE FROM tournament_admins
      WHERE tournament_id IN (SELECT id FROM del_tournaments)
         OR player_id IN (SELECT id FROM del_players)`);
  }
  if (haveTable.has("tournament_categories")) {
    step("tournament_categories", `DELETE FROM tournament_categories
      WHERE created_by IN (SELECT id FROM del_players)`);
  }
  step("tournaments", `DELETE FROM tournaments WHERE id IN (SELECT id FROM del_tournaments)`);

  // Orphaned membership rows left behind by tournaments deleted long ago.
  if (haveTable.has("tournament_team_rosters")) {
    step("tournament_team_rosters (orphans)", `DELETE FROM tournament_team_rosters
      WHERE tournament_id NOT IN (SELECT id FROM tournaments)`);
  }
  if (haveTable.has("tournament_participants")) {
    step("tournament_participants (orphans)", `DELETE FROM tournament_participants
      WHERE tournament_id NOT IN (SELECT id FROM tournaments)`);
  }
  if (haveTable.has("tournament_admins")) {
    step("tournament_admins (orphans)", `DELETE FROM tournament_admins
      WHERE tournament_id NOT IN (SELECT id FROM tournaments)`);
  }

  // Team-scoped artefacts.
  if (haveTable.has("team_member_devices")) {
    step("team_member_devices", `DELETE FROM team_member_devices
      WHERE player_id IN (SELECT id FROM del_players) OR team_id IN (SELECT id FROM del_teams)`);
  }
  if (haveTable.has("team_squad_images")) {
    step("team_squad_images", `DELETE FROM team_squad_images WHERE team_id IN (SELECT id FROM del_teams)`);
  }
  if (haveTable.has("team_chat_messages")) {
    step("team_chat_messages", `DELETE FROM team_chat_messages
      WHERE team_id IN (SELECT id FROM del_teams) OR sender_id IN (SELECT id FROM del_players)`);
  }
  if (haveTable.has("player_transfers")) {
    step("player_transfers", `DELETE FROM player_transfers
      WHERE player_id IN (SELECT id FROM del_players)
         OR from_team_id IN (SELECT id FROM del_teams)
         OR to_team_id IN (SELECT id FROM del_teams)`);
  }
  if (haveTable.has("news")) {
    if (await columnExists("news", "team_id")) {
      step("news.team_id -> NULL", `UPDATE news SET team_id = NULL WHERE team_id IN (SELECT id FROM del_teams)`);
    }
    if (await columnExists("news", "author_id")) {
      step("news by fake author", `DELETE FROM news WHERE author_id IN (SELECT id FROM del_players)`);
    }
  }
  step("teams.president_id/coach_id -> NULL", `UPDATE teams SET
      president_id = CASE WHEN president_id IN (SELECT id FROM del_players) THEN NULL ELSE president_id END,
      coach_id     = CASE WHEN coach_id     IN (SELECT id FROM del_players) THEN NULL ELSE coach_id END
    WHERE president_id IN (SELECT id FROM del_players) OR coach_id IN (SELECT id FROM del_players)`);
  step("teams", `DELETE FROM teams WHERE id IN (SELECT id FROM del_teams)`);
  step("players.team_id -> NULL", `UPDATE players SET team_id = NULL WHERE team_id IN (SELECT id FROM del_teams)`);
  step("players", `DELETE FROM players WHERE id IN (SELECT id FROM del_players)`);

  // Social, community, support, notifications, ads, agent chat, awards.
  if (haveTable.has("player_follows")) {
    step("player_follows", `DELETE FROM player_follows
      WHERE follower_id IN (SELECT id FROM del_players) OR following_id IN (SELECT id FROM del_players)`);
  }
  if (haveTable.has("direct_messages")) {
    step("direct_messages", `DELETE FROM direct_messages
      WHERE sender_id IN (SELECT id FROM del_players) OR recipient_id IN (SELECT id FROM del_players)`);
  }
  if (haveTable.has("community_posts")) {
    step("community_posts", `DELETE FROM community_posts WHERE author_id IN (SELECT id FROM del_players)`);
  }
  if (haveTable.has("community_post_likes")) {
    step("community_post_likes", `DELETE FROM community_post_likes
      WHERE user_id IN (SELECT id FROM del_players)
         OR post_id NOT IN (SELECT id FROM community_posts)`);
  }
  if (haveTable.has("community_post_comments")) {
    step("community_post_comments", `DELETE FROM community_post_comments
      WHERE author_id IN (SELECT id FROM del_players)
         OR post_id NOT IN (SELECT id FROM community_posts)`);
  }
  if (haveTable.has("support_ticket_messages")) {
    step("support_ticket_messages", `DELETE FROM support_ticket_messages
      WHERE sender_id IN (SELECT id FROM del_players)
         OR ticket_id NOT IN (SELECT id FROM support_tickets)`);
  }
  if (haveTable.has("support_ticket_ratings")) {
    step("support_ticket_ratings", `DELETE FROM support_ticket_ratings
      WHERE user_id IN (SELECT id FROM del_players) OR admin_id IN (SELECT id FROM del_players)`);
  }
  if (haveTable.has("support_tickets")) {
    step("support_tickets", `DELETE FROM support_tickets
      WHERE user_id IN (SELECT id FROM del_players) OR assigned_admin_id IN (SELECT id FROM del_players)`);
  }
  if (haveTable.has("admin_notifications")) {
    step("admin_notifications", `DELETE FROM admin_notifications
      WHERE user_id IN (SELECT id FROM del_players) OR admin_id IN (SELECT id FROM del_players)`);
  }
  if (haveTable.has("admin_availability")) {
    step("admin_availability", `DELETE FROM admin_availability WHERE admin_id IN (SELECT id FROM del_players)`);
  }
  if (haveTable.has("ads") && await columnExists("ads", "created_by")) {
    step("ads", `DELETE FROM ads WHERE created_by IN (SELECT id FROM del_players)`);
  }
  if (haveTable.has("agent_messages")) {
    step("agent_messages", `DELETE FROM agent_messages
      WHERE sender_player_id IN (SELECT id FROM del_players)
         OR conversation_id NOT IN (SELECT id FROM agent_conversations)`);
  }
  if (haveTable.has("agent_conversations")) {
    step("agent_conversations", `DELETE FROM agent_conversations
      WHERE player_id IN (SELECT id FROM del_players) OR agent_player_id IN (SELECT id FROM del_players)`);
  }
  if (haveTable.has("hall_of_fame")) {
    step("hall_of_fame", `DELETE FROM hall_of_fame WHERE player_id IN (SELECT id FROM del_players)`);
  }
  if (haveTable.has("seasons")) {
    step("seasons awards -> NULL", `UPDATE seasons SET
        top_scorer_player_id = CASE WHEN top_scorer_player_id IN (SELECT id FROM del_players) THEN NULL ELSE top_scorer_player_id END,
        ballon_dor_player_id = CASE WHEN ballon_dor_player_id IN (SELECT id FROM del_players) THEN NULL ELSE ballon_dor_player_id END
      WHERE top_scorer_player_id IN (SELECT id FROM del_players) OR ballon_dor_player_id IN (SELECT id FROM del_players)`);
  }
  if (haveTable.has("coin_transactions")) {
    step("coin_transactions", `DELETE FROM coin_transactions WHERE player_id IN (SELECT id FROM del_players)`);
  }
  if (haveTable.has("discord_tokens")) {
    step("discord_tokens", `DELETE FROM discord_tokens WHERE player_id IN (SELECT id FROM del_players)`);
  }

  // ── Execute ───────────────────────────────────────────────────────────────
  log("== ROWS AFFECTED ==");
  let total = 0;
  for (const s of steps) {
    const res = await run(s.sql, s.params);
    total += res.rowCount;
    log(`  ${String(res.rowCount).padStart(6)}  ${s.label}`);
  }
  log(`  ${String(total).padStart(6)}  TOTAL ROWS AFFECTED`);
  log("");

  const one = async (sql) => (await rows(sql))[0].n;
  log("== RESULT (inside transaction) ==");
  log(`  players remaining            : ${await one(`SELECT count(*)::int n FROM players`)}`);
  log(`  teams remaining              : ${await one(`SELECT count(*)::int n FROM teams`)}`);
  log(`  tournaments remaining        : ${await one(`SELECT count(*)::int n FROM tournaments`)}`);
  log(`  matches remaining            : ${await one(`SELECT count(*)::int n FROM matches`)}`);
  log(`  tournament_participants left : ${await one(`SELECT count(*)::int n FROM tournament_participants`)}`);
  log(`  fake-pattern players left    : ${await one(`SELECT count(*)::int n FROM players WHERE username ~ '${FAKE_PLAYER_REGEX}'`)}`);
  log("");

  log("== SURVIVING TEAMS ==");
  for (const t of await rows(`SELECT id, name FROM teams ORDER BY id`)) log(`  #${t.id} ${t.name}`);
  log("== SURVIVING PLAYERS ==");
  for (const p of await rows(`SELECT id, username FROM players ORDER BY id`)) log(`  #${p.id} ${p.username}`);

  if (APPLY) {
    await run("COMMIT");
    log("\nCommitted.");
  } else {
    await run("ROLLBACK");
    log("\nDry run complete — ROLLED BACK. Re-run with --apply to commit.");
  }
} catch (err) {
  try { await run("ROLLBACK"); } catch { /* ignore */ }
  console.error("\nFAILED — transaction rolled back, nothing changed.");
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
} finally {
  await client.end();
}
