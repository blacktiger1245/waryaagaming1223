import { Router } from "express";
import { db } from "@workspace/db";
import { newsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { ListNewsQueryParams, CreateNewsBody, GetNewsParams } from "@workspace/api-zod";

const router = Router();

router.get("/news", async (req, res) => {
  const query = ListNewsQueryParams.safeParse(req.query);
  if (!query.success) return res.status(400).json({ error: "Invalid query" });

  const { category, limit = 20, offset = 0 } = query.data;

  const news = await db
    .select()
    .from(newsTable)
    .where(category ? eq(newsTable.category, category) : undefined)
    .limit(limit)
    .offset(offset)
    .orderBy(newsTable.publishedAt);

  return res.json(
    news.map((n) => ({
      ...n,
      publishedAt: (n.publishedAt ?? n.createdAt).toISOString(),
      createdAt: n.createdAt.toISOString(),
    }))
  );
});

router.post("/news", async (req, res) => {
  const body = CreateNewsBody.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Invalid body" });

  const slug = body.data.title
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .substring(0, 80);

  const [article] = await db
    .insert(newsTable)
    .values({ ...body.data, slug, isFeatured: body.data.isFeatured ?? false })
    .returning();

  return res.status(201).json({
    ...article,
    publishedAt: article.publishedAt.toISOString(),
    createdAt: article.createdAt.toISOString(),
  });
});

router.get("/news/:id", async (req, res) => {
  const params = GetNewsParams.safeParse(req.params);
  if (!params.success) return res.status(400).json({ error: "Invalid params" });

  const [article] = await db.select().from(newsTable).where(eq(newsTable.id, params.data.id));
  if (!article) return res.status(404).json({ error: "Article not found" });

  return res.json({
    ...article,
    publishedAt: article.publishedAt.toISOString(),
    createdAt: article.createdAt.toISOString(),
  });
});

export default router;
