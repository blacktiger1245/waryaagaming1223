import { Router } from "express";
import { db } from "@workspace/db";
import { mediaTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { ListMediaQueryParams, CreateMediaBody } from "@workspace/api-zod";

const router = Router();

router.get("/media", async (req, res) => {
  const query = ListMediaQueryParams.safeParse(req.query);
  if (!query.success) return res.status(400).json({ error: "Invalid query" });

  const { platform, limit = 20 } = query.data;

  const items = await db
    .select()
    .from(mediaTable)
    .where(platform ? eq(mediaTable.platform, platform) : undefined)
    .limit(limit)
    .orderBy(mediaTable.createdAt);

  return res.json(
    items.map((m) => ({ ...m, createdAt: m.createdAt.toISOString() }))
  );
});

router.post("/media", async (req, res) => {
  const body = CreateMediaBody.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Invalid body" });

  const [item] = await db.insert(mediaTable).values(body.data).returning();
  return res.status(201).json({ ...item, createdAt: item.createdAt.toISOString() });
});

export default router;
