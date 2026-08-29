import { Router } from "express";
import { db } from "@workspace/db";
import { seasonsTable, playersTable } from "@workspace/db";
import { desc, eq, aliasedTable } from "drizzle-orm";

const router = Router();

const topScorer = aliasedTable(playersTable, "top_scorer");
const ballonDor = aliasedTable(playersTable, "ballon_dor");

// Public: list all seasons (for rankings dropdown etc.) with award winners
router.get("/seasons", async (_req, res) => {
  const seasons = await db
    .select({
      id: seasonsTable.id,
      name: seasonsTable.name,
      isCurrent: seasonsTable.isCurrent,
      createdAt: seasonsTable.createdAt,
      topScorerPlayerId: seasonsTable.topScorerPlayerId,
      ballonDorPlayerId: seasonsTable.ballonDorPlayerId,
      topScorerPlayer: {
        id: topScorer.id,
        username: topScorer.username,
        displayName: topScorer.displayName,
        avatarUrl: topScorer.avatarUrl,
      },
      ballonDorPlayer: {
        id: ballonDor.id,
        username: ballonDor.username,
        displayName: ballonDor.displayName,
        avatarUrl: ballonDor.avatarUrl,
      },
    })
    .from(seasonsTable)
    .leftJoin(topScorer, eq(topScorer.id, seasonsTable.topScorerPlayerId))
    .leftJoin(ballonDor, eq(ballonDor.id, seasonsTable.ballonDorPlayerId))
    .orderBy(desc(seasonsTable.createdAt));
  return res.json(seasons);
});

export default router;
