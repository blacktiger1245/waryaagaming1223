// One-off SAFE recalculation of every player's Points and Market Value.
//
// Uses the canonical playerPoints() and pointsToMarketValue() functions.
// Only updates `points` and `market_value` — NEVER touches any statistic
// (appearances, wins, draws, goals, clean sheets, MOTM, losses, etc.).
//
// Run with:  npx tsx lib/db/src/fix-recalc-player-points.ts
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { playerPoints, pointsToMarketValue } from "./player-stats";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadEnv(): string {
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
  if (!url) {
    console.error("DATABASE_URL is not set. No changes were made.");
    process.exit(1);
  }

  const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: true } });
  await client.connect();
  console.log("Connected to:", (await client.query("SELECT current_database() db")).rows[0].db);

  // Read every player (do NOT modify any statistic).
  const { rows: players } = await client.query(
    `SELECT id, username,
            matches_played, matches_won, clean_sheets,
            goals_scored, man_of_the_match, draws
       FROM players
      ORDER BY id`,
  );

  const changed = [];
  const unchangedCount = [];
  for (const p of players) {
    const points = playerPoints({
      appearances: p.matches_played ?? 0,
      wins: p.matches_won ?? 0,
      cleanSheets: p.clean_sheets ?? 0,
      goals: p.goals_scored ?? 0,
      motm: p.man_of_the_match ?? 0,
      draws: p.draws ?? 0,
    });
    const marketValue = pointsToMarketValue(points);
    if (points !== p.points || marketValue !== p.market_value) {
      changed.push({ id: p.id, username: p.username, points, marketValue });
      await client.query(
        `UPDATE players SET points = $1, market_value = $2 WHERE id = $3`,
        [points, marketValue, p.id],
      );
    } else {
      unchangedCount.push({ id: p.id, username: p.username, points, marketValue });
    }
  }

  console.log("\nPlayers found:", players.length);
  console.log("Players whose points/market_value changed:", changed.length);
  console.log("Players already correct (unchanged):", unchangedCount.length);

  console.log("\nSample BEFORE-recalc stats for a few players:");
  for (const p of players.slice(0, 5)) {
    console.log(`  #${p.id} ${p.username}: app=${p.matches_played} w=${p.matches_won} cs=${p.clean_sheets} g=${p.goals_scored} motm=${p.man_of_the_match} d=${p.draws}`);
  }

  console.log("\nVerification — read back from DB after update:");
  const sampleIds = players.slice(0, 5).map((p) => p.id);
  if (sampleIds.length) {
    const { rows: verify } = await client.query(
      `SELECT id, username, points, market_value FROM players WHERE id = ANY($1) ORDER BY id`,
      [sampleIds],
    );
    for (const row of verify) {
      console.log(`  #${row.id} ${row.username}: points=${row.points}, market_value=${row.market_value}M`);
    }
    // Recompute the expected values independently to prove correctness.
    const before = new Map(players.map((p) => [p.id, p]));
    for (const row of verify) {
      const b = before.get(row.id)!;
      const expect = playerPoints({
        appearances: b.matches_played ?? 0,
        wins: b.matches_won ?? 0,
        cleanSheets: b.clean_sheets ?? 0,
        goals: b.goals_scored ?? 0,
        motm: b.man_of_the_match ?? 0,
        draws: b.draws ?? 0,
      });
      const expectMv = pointsToMarketValue(expect);
      console.log(`    expected: points=${expect}, market_value=${expectMv}M  (${row.points === expect && row.market_value === expectMv ? "OK" : "MISMATCH"})`);
    }
  }

  await client.end();
  console.log("\nDone.");
}

main().catch((err) => {
  console.error("Unexpected error:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
