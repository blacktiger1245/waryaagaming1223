import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { db, adsTable, playersTable } from "@workspace/db";
import { eq, ne, and, desc, sql } from "drizzle-orm";
import { ObjectStorageService } from "../lib/objectStorage";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

// ─── Owner-only authorization ────────────────────────────────────────────────
// Advertisement management is strictly reserved for the Owner role. Anyone
// without `role === "owner"` (including admins, legacy isAdmin sessions and
// unauthenticated visitors) is rejected with 403 — never rely on frontend-only
// hiding.
function requireOwner(req: Request, res: Response, next: NextFunction) {
  if (req.session?.role === "owner") return next();
  return res.status(403).json({ error: "Owner privileges required" });
}

// ─── Validation helpers ───────────────────────────────────────────────────────
function isValidSafeUrl(raw: string): boolean {
  try {
    const url = new URL(raw.trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function isPositiveInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function toJson(ad: typeof adsTable.$inferSelect) {
  return {
    id: ad.id,
    videoUrl: ad.videoUrl,
    targetUrl: ad.targetUrl,
    closeAfterSeconds: ad.closeAfterSeconds,
    isActive: ad.isActive,
    createdBy: ad.createdBy,
    createdAt: ad.createdAt.toISOString(),
    updatedAt: ad.updatedAt.toISOString(),
  };
}

// ─── Public: active advertisement ─────────────────────────────────────────────
// Exposes only the fields the frontend needs to render the interstitial and
// never private admin/owner info. Returns `{ ad: null }` when none is active.
router.get("/ads/active", async (req, res) => {
  try {
    const [ad] = await db
      .select()
      .from(adsTable)
      .where(eq(adsTable.isActive, true))
      .orderBy(desc(adsTable.createdAt))
      .limit(1);

    if (!ad) {
      return res.json({ ad: null });
    }
    return res.json({
      ad: {
        id: ad.id,
        videoUrl: ad.videoUrl,
        targetUrl: ad.targetUrl,
        closeAfterSeconds: ad.closeAfterSeconds,
      },
    });
  } catch (error: unknown) {
    req.log.error({ err: error }, "Error fetching active advertisement");
    // Never block the website — an ad failure returns no ad.
    return res.json({ ad: null });
  }
});

// ─── Owner: list all advertisements ───────────────────────────────────────────
router.get("/admin/ads", requireOwner, async (req, res) => {
  try {
    const rows = await db
      .select({
        ad: adsTable,
        createdByUsername: playersTable.username,
      })
      .from(adsTable)
      .leftJoin(playersTable, eq(adsTable.createdBy, playersTable.id))
      .orderBy(desc(adsTable.createdAt));

    return res.json(
      rows.map((row) => ({
        ...toJson(row.ad),
        createdByUsername: row.createdByUsername ?? null,
      })),
    );
  } catch (error: unknown) {
    req.log.error({ err: error }, "Error listing advertisements");
    return res.status(500).json({ error: "Failed to load advertisements" });
  }
});

// ─── Owner: create advertisement ──────────────────────────────────────────────
interface AdCreateBody {
  videoUrl?: string;
  targetUrl?: string;
  closeAfterSeconds?: number;
  isActive?: boolean;
}

router.post("/admin/ads", requireOwner, async (req, res) => {
  const body = req.body as AdCreateBody;

  const videoUrl = body.videoUrl?.trim();
  const targetUrl = body.targetUrl?.trim();
  const closeAfterSeconds = body.closeAfterSeconds;

  if (!videoUrl) {
    return res.status(400).json({ error: "Video is required. Upload a video first." });
  }
  if (!targetUrl) {
    return res.status(400).json({ error: "Advertisement link is required." });
  }
  if (!isValidSafeUrl(targetUrl)) {
    return res.status(400).json({ error: "Advertisement link must be a valid http(s) URL." });
  }
  if (!isPositiveInt(closeAfterSeconds)) {
    return res.status(400).json({ error: "Seconds to Close must be a positive number." });
  }

  try {
    const [item] = await db
      .insert(adsTable)
      .values({
        videoUrl,
        targetUrl: targetUrl.trim(),
        closeAfterSeconds,
        isActive: body.isActive ?? true,
        createdBy: req.session.userId ?? 0,
      })
      .returning();

    return res.status(201).json(toJson(item));
  } catch (error: unknown) {
    req.log.error({ err: error }, "Error creating advertisement");
    return res.status(500).json({ error: "Failed to save advertisement" });
  }
});

// ─── Owner: activate / deactivate ─────────────────────────────────────────────
router.patch("/admin/ads/:id/status", requireOwner, async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

  const isActive = Boolean((req.body as { isActive?: boolean } | undefined)?.isActive);

  try {
    const [item] = await db
      .update(adsTable)
      .set({ isActive, updatedAt: new Date() })
      .where(eq(adsTable.id, id))
      .returning();

    if (!item) return res.status(404).json({ error: "Advertisement not found" });
    return res.json(toJson(item));
  } catch (error: unknown) {
    req.log.error({ err: error }, "Error toggling advertisement status");
    return res.status(500).json({ error: "Failed to update advertisement status" });
  }
});

// ─── Owner: delete advertisement ──────────────────────────────────────────────
router.delete("/admin/ads/:id", requireOwner, async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

  try {
    const [existing] = await db
      .select({ videoUrl: adsTable.videoUrl })
      .from(adsTable)
      .where(eq(adsTable.id, id));

    if (!existing) return res.status(404).json({ error: "Advertisement not found" });

    await db.delete(adsTable).where(eq(adsTable.id, id));

    // Clean up the associated video from storage — but only when no other
    // advertisement still points at the same object path, so a video shared by
    // another ad is never removed. Storage errors are logged but never fail
    // the database deletion.
    try {
      const [otherRefs] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(adsTable)
        .where(and(eq(adsTable.videoUrl, existing.videoUrl), ne(adsTable.id, id)));

      if (!otherRefs || otherRefs.count === 0) {
        await objectStorageService.deleteObjectByEntityPath(existing.videoUrl);
      }
    } catch (cleanupErr: unknown) {
      req.log.warn(
        { err: cleanupErr, objectPath: existing.videoUrl },
        "Advertisement deleted but video cleanup failed",
      );
    }

    return res.json({ ok: true });
  } catch (error: unknown) {
    req.log.error({ err: error }, "Error deleting advertisement");
    return res.status(500).json({ error: "Failed to delete advertisement" });
  }
});

export default router;