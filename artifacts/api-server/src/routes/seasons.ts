import { Router } from "express";
import { db } from "@workspace/db";
import { seasonsTable } from "@workspace/db";
import { desc } from "drizzle-orm";

const router = Router();

// Public: list all seasons (for rankings dropdown etc.)
router.get("/seasons", async (_req, res) => {
  const seasons = await db.select().from(seasonsTable).orderBy(desc(seasonsTable.createdAt));
  return res.json(seasons);
});

export default router;
