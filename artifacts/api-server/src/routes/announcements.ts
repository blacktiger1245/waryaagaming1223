import { Router, type Request, type Response, type NextFunction } from "express";
import { db } from "@workspace/db";
import { announcementsTable } from "@workspace/db";
import { eq, and, or, isNull, gte, desc } from "drizzle-orm";

const router = Router();

const VALID_TYPES = ["info", "warning", "success", "danger"] as const;
type AnnouncementType = typeof VALID_TYPES[number];

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const discordAdmin =
    req.session.userId &&
    (req.session.role === "admin" || req.session.role === "owner");
  if (discordAdmin || req.session.isAdmin) return next();
  return res.status(401).json({ error: "Unauthorized" });
}

interface AnnouncementBody {
  message?: string;
  type?: AnnouncementType;
  link?: string;
  linkText?: string;
  isActive?: boolean;
  expiresAt?: string;
}

// GET /announcements — public: only active, non-expired announcements
router.get("/announcements", async (_req, res) => {
  const now = new Date();
  const items = await db
    .select()
    .from(announcementsTable)
    .where(
      and(
        eq(announcementsTable.isActive, true),
        or(isNull(announcementsTable.expiresAt), gte(announcementsTable.expiresAt, now))
      )
    )
    .orderBy(desc(announcementsTable.createdAt));

  return res.json(
    items.map((a) => ({
      ...a,
      expiresAt: a.expiresAt ? a.expiresAt.toISOString() : null,
      createdAt: a.createdAt.toISOString(),
    }))
  );
});

// GET /admin/announcements — admin: all announcements
router.get("/admin/announcements", requireAdmin, async (_req, res) => {
  const items = await db
    .select()
    .from(announcementsTable)
    .orderBy(desc(announcementsTable.createdAt));

  return res.json(
    items.map((a) => ({
      ...a,
      expiresAt: a.expiresAt ? a.expiresAt.toISOString() : null,
      createdAt: a.createdAt.toISOString(),
    }))
  );
});

// POST /admin/announcements — create
router.post("/admin/announcements", requireAdmin, async (req, res) => {
  const body = req.body as AnnouncementBody;
  if (!body.message?.trim()) return res.status(400).json({ error: "message is required" });
  if (body.type && !VALID_TYPES.includes(body.type)) return res.status(400).json({ error: "Invalid type" });

  const [item] = await db
    .insert(announcementsTable)
    .values({
      message: body.message.trim(),
      type: body.type ?? "info",
      link: body.link ?? null,
      linkText: body.linkText ?? null,
      isActive: body.isActive ?? true,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
    })
    .returning();

  return res.status(201).json({
    ...item,
    expiresAt: item.expiresAt ? item.expiresAt.toISOString() : null,
    createdAt: item.createdAt.toISOString(),
  });
});

// PATCH /admin/announcements/:id — update
router.patch("/admin/announcements/:id", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

  const body = req.body as AnnouncementBody;
  if (body.type && !VALID_TYPES.includes(body.type)) return res.status(400).json({ error: "Invalid type" });

  const values: Record<string, unknown> = {};
  if (body.message !== undefined) values.message = body.message.trim();
  if (body.type !== undefined) values.type = body.type;
  if (body.link !== undefined) values.link = body.link || null;
  if (body.linkText !== undefined) values.linkText = body.linkText || null;
  if (body.isActive !== undefined) values.isActive = body.isActive;
  if (body.expiresAt !== undefined) values.expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;

  const [item] = await db
    .update(announcementsTable)
    .set(values)
    .where(eq(announcementsTable.id, id))
    .returning();

  if (!item) return res.status(404).json({ error: "Not found" });

  return res.json({
    ...item,
    expiresAt: item.expiresAt ? item.expiresAt.toISOString() : null,
    createdAt: item.createdAt.toISOString(),
  });
});

// DELETE /admin/announcements/:id — delete
router.delete("/admin/announcements/:id", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

  await db.delete(announcementsTable).where(eq(announcementsTable.id, id));
  return res.json({ ok: true });
});

export default router;
