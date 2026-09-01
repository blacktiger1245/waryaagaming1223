import { Router, type Request, type Response, type NextFunction } from "express";
import { db } from "@workspace/db";
import { academyPostsTable, ACADEMY_CATEGORIES, type AcademyCategory } from "@workspace/db";
import { eq, asc, ilike, and } from "drizzle-orm";

const router = Router();

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const discordAdmin =
    req.session.userId &&
    (req.session.role === "admin" || req.session.role === "owner");
  if (discordAdmin || req.session.isAdmin) return next();
  return res.status(401).json({ error: "Unauthorized" });
}

function validCategory(input: unknown): AcademyCategory | null {
  return ACADEMY_CATEGORIES.includes(input as AcademyCategory)
    ? (input as AcademyCategory)
    : null;
}

// GET /academy/posts?category=player_training&q=name — public: published posts
router.get("/academy/posts", async (req, res) => {
  const category = validCategory(req.query.category);
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";

  const conditions = [eq(academyPostsTable.isPublished, true)];
  if (category) conditions.push(eq(academyPostsTable.category, category));
  if (q) conditions.push(ilike(academyPostsTable.title, `%${q}%`));

  const posts = await db
    .select()
    .from(academyPostsTable)
    .where(and(...conditions))
    .orderBy(asc(academyPostsTable.sortOrder), asc(academyPostsTable.id));
  return res.json(posts);
});

// GET /admin/academy/posts?category=... — admin: everything including drafts
router.get("/admin/academy/posts", requireAdmin, async (req, res) => {
  const category = validCategory(req.query.category);

  const posts = await db
    .select()
    .from(academyPostsTable)
    .where(category ? eq(academyPostsTable.category, category) : undefined)
    .orderBy(asc(academyPostsTable.sortOrder), asc(academyPostsTable.id));
  return res.json(posts);
});

// POST /admin/academy/posts — create a post
router.post("/admin/academy/posts", requireAdmin, async (req, res) => {
  const { category = "player_training", title, body = "", imageUrl, sortOrder = 0, isPublished = true } = req.body ?? {};
  if (!validCategory(category)) {
    return res.status(400).json({ error: "Invalid category" });
  }
  if (!title || typeof title !== "string" || !title.trim()) {
    return res.status(400).json({ error: "title is required" });
  }
  try {
    const [post] = await db
      .insert(academyPostsTable)
      .values({
        category: category as AcademyCategory,
        title: title.trim(),
        body: String(body ?? ""),
        imageUrl: typeof imageUrl === "string" && imageUrl.trim() ? imageUrl.trim() : null,
        sortOrder: Number(sortOrder) || 0,
        isPublished: Boolean(isPublished),
        updatedBy: req.session.username ?? null,
      })
      .returning();
    return res.status(201).json(post);
  } catch {
    return res.status(400).json({ error: "Could not create the post" });
  }
});

// PATCH /admin/academy/posts/:id — update a post
router.patch("/admin/academy/posts/:id", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const { category, title, body, imageUrl, sortOrder, isPublished } = req.body ?? {};
  const set: Partial<typeof academyPostsTable.$inferInsert> = {
    updatedAt: new Date(),
    updatedBy: req.session.username ?? null,
  };
  if (category != null) {
    const cat = validCategory(category);
    if (!cat) return res.status(400).json({ error: "Invalid category" });
    set.category = cat;
  }
  if (typeof title === "string" && title.trim()) set.title = title.trim();
  if (typeof body === "string") set.body = body;
  if (imageUrl !== undefined) set.imageUrl = typeof imageUrl === "string" && imageUrl.trim() ? imageUrl.trim() : null;
  if (sortOrder != null) set.sortOrder = Number(sortOrder) || 0;
  if (isPublished != null) set.isPublished = Boolean(isPublished);

  const [post] = await db
    .update(academyPostsTable)
    .set(set)
    .where(eq(academyPostsTable.id, id))
    .returning();
  if (!post) return res.status(404).json({ error: "Post not found" });
  return res.json(post);
});

// DELETE /admin/academy/posts/:id
router.delete("/admin/academy/posts/:id", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const [post] = await db
    .delete(academyPostsTable)
    .where(eq(academyPostsTable.id, id))
    .returning();
  if (!post) return res.status(404).json({ error: "Post not found" });
  return res.json({ ok: true });
});

export default router;