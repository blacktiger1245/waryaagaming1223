import { Router, type Request, type Response, type NextFunction } from "express";
import { db } from "@workspace/db";
import { academySectionsTable } from "@workspace/db";
import { eq, asc } from "drizzle-orm";

const router = Router();

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const discordAdmin =
    req.session.userId &&
    (req.session.role === "admin" || req.session.role === "owner");
  if (discordAdmin || req.session.isAdmin) return next();
  return res.status(401).json({ error: "Unauthorized" });
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || `section-${Date.now()}`;
}

// GET /academy/sections — public: published sections in order
router.get("/academy/sections", async (_req, res) => {
  const sections = await db
    .select()
    .from(academySectionsTable)
    .where(eq(academySectionsTable.isPublished, true))
    .orderBy(asc(academySectionsTable.sortOrder), asc(academySectionsTable.id));
  return res.json(sections);
});

// GET /admin/academy/sections — admin: everything including drafts
router.get("/admin/academy/sections", requireAdmin, async (_req, res) => {
  const sections = await db
    .select()
    .from(academySectionsTable)
    .orderBy(asc(academySectionsTable.sortOrder), asc(academySectionsTable.id));
  return res.json(sections);
});

// POST /admin/academy/sections — create a section
router.post("/admin/academy/sections", requireAdmin, async (req, res) => {
  const { title, body = "", slug, sortOrder = 0, isPublished = true } = req.body ?? {};
  if (!title || typeof title !== "string") {
    return res.status(400).json({ error: "title is required" });
  }
  const finalSlug = slugify(slug || title);
  try {
    const [section] = await db
      .insert(academySectionsTable)
      .values({
        slug: finalSlug,
        title: title.trim(),
        body: String(body ?? ""),
        sortOrder: Number(sortOrder) || 0,
        isPublished: Boolean(isPublished),
        updatedBy: req.session.username ?? null,
      })
      .returning();
    return res.status(201).json(section);
  } catch {
    return res.status(409).json({ error: "A section with this name already exists" });
  }
});

// PATCH /admin/academy/sections/:id — update a section
router.patch("/admin/academy/sections/:id", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const { title, body, sortOrder, isPublished } = req.body ?? {};
  const set: Partial<typeof academySectionsTable.$inferInsert> = {
    updatedAt: new Date(),
    updatedBy: req.session.username ?? null,
  };
  if (typeof title === "string" && title.trim()) set.title = title.trim();
  if (typeof body === "string") set.body = body;
  if (sortOrder != null) set.sortOrder = Number(sortOrder) || 0;
  if (isPublished != null) set.isPublished = Boolean(isPublished);

  const [section] = await db
    .update(academySectionsTable)
    .set(set)
    .where(eq(academySectionsTable.id, id))
    .returning();
  if (!section) return res.status(404).json({ error: "Section not found" });
  return res.json(section);
});

// DELETE /admin/academy/sections/:id
router.delete("/admin/academy/sections/:id", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const [section] = await db
    .delete(academySectionsTable)
    .where(eq(academySectionsTable.id, id))
    .returning();
  if (!section) return res.status(404).json({ error: "Section not found" });
  return res.json({ ok: true });
});

export default router;