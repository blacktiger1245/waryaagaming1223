import { Router, type Request, type Response } from "express";
import { db } from "@workspace/db";
import {
  communityPostsTable,
  communityPostLikesTable,
  communityPostCommentsTable,
  playersTable,
} from "@workspace/db";
import { eq, sql, and, desc } from "drizzle-orm";

const router = Router();

function isAdmin(req: Request): boolean {
  return (
    !!req.session?.userId &&
    (req.session?.role === "admin" || req.session?.role === "owner")
  );
}

// ── helpers ───────────────────────────────────────────────────────────────────

async function enrichPosts(posts: any[], viewerUserId: number | null) {
  if (posts.length === 0) return [];

  const postIds = posts.map((p) => p.id);
  const idList = postIds.join(",");

  const [likeCounts, commentCounts] = await Promise.all([
    db
      .select({
        postId: communityPostLikesTable.postId,
        count: sql<number>`count(*)::int`,
      })
      .from(communityPostLikesTable)
      .where(sql`${communityPostLikesTable.postId} = ANY(ARRAY[${sql.raw(idList)}]::int[])`)
      .groupBy(communityPostLikesTable.postId),

    db
      .select({
        postId: communityPostCommentsTable.postId,
        count: sql<number>`count(*)::int`,
      })
      .from(communityPostCommentsTable)
      .where(sql`${communityPostCommentsTable.postId} = ANY(ARRAY[${sql.raw(idList)}]::int[])`)
      .groupBy(communityPostCommentsTable.postId),
  ]);

  let likedByViewer: Set<number> = new Set();
  if (viewerUserId) {
    const rows = await db
      .select({ postId: communityPostLikesTable.postId })
      .from(communityPostLikesTable)
      .where(
        and(
          sql`${communityPostLikesTable.postId} = ANY(ARRAY[${sql.raw(idList)}]::int[])`,
          eq(communityPostLikesTable.userId, viewerUserId),
        ),
      );
    likedByViewer = new Set(rows.map((r) => r.postId));
  }

  const likeMap = new Map(likeCounts.map((r) => [r.postId, r.count]));
  const commentMap = new Map(commentCounts.map((r) => [r.postId, r.count]));

  return posts.map((p) => ({
    ...p,
    createdAt: p.createdAt instanceof Date ? p.createdAt.toISOString() : p.createdAt,
    likeCount: likeMap.get(p.id) ?? 0,
    commentCount: commentMap.get(p.id) ?? 0,
    likedByMe: likedByViewer.has(p.id),
  }));
}

// ── GET /community/posts ──────────────────────────────────────────────────────

router.get("/community/posts", async (req: Request, res: Response) => {
  const limit = Math.min(Number(req.query.limit ?? 30), 100);
  const offset = Number(req.query.offset ?? 0);
  const viewerUserId: number | null = req.session?.userId ?? null;

  const posts = await db
    .select({
      id: communityPostsTable.id,
      authorId: communityPostsTable.authorId,
      content: communityPostsTable.content,
      imageUrl: communityPostsTable.imageUrl,
      createdAt: communityPostsTable.createdAt,
      authorUsername: playersTable.username,
      authorDisplayName: playersTable.displayName,
      authorVerified: playersTable.verified,
      authorAvatarUrl: playersTable.avatarUrl,
    })
    .from(communityPostsTable)
    .leftJoin(playersTable, eq(communityPostsTable.authorId, playersTable.id))
    .orderBy(desc(communityPostsTable.createdAt))
    .limit(limit)
    .offset(offset);

  const enriched = await enrichPosts(posts, viewerUserId);
  res.json(enriched);
});

// ── POST /community/posts ─────────────────────────────────────────────────────

router.post("/community/posts", async (req: Request, res: Response) => {
  if (!req.session?.userId) {
    res.status(401).json({ error: "Login required" });
    return;
  }

  const { content, imageUrl, videoUrl } = req.body ?? {};
  if (!content || typeof content !== "string" || content.trim().length === 0) {
    res.status(400).json({ error: "Content is required" });
    return;
  }
  if (content.length > 2000) {
    res.status(400).json({ error: "Content too long (max 2000 chars)" });
    return;
  }
  if (videoUrl != null && (typeof videoUrl !== "string" || (!/^https?:\/\//i.test(videoUrl) && !/^\/objects\//.test(videoUrl)))) {
    res.status(400).json({ error: "Invalid video URL" });
    return;
  }

  const [post] = await db
    .insert(communityPostsTable)
    .values({
      authorId: req.session.userId,
      content: content.trim(),
      imageUrl: imageUrl ?? null,
      videoUrl: videoUrl ?? null,
    })
    .returning();

  const [withAuthor] = await db
    .select({
      id: communityPostsTable.id,
      authorId: communityPostsTable.authorId,
      content: communityPostsTable.content,
      imageUrl: communityPostsTable.imageUrl,
      videoUrl: communityPostsTable.videoUrl,
      createdAt: communityPostsTable.createdAt,
      authorUsername: playersTable.username,
      authorDisplayName: playersTable.displayName,
      authorAvatarUrl: playersTable.avatarUrl,
      authorVerified: playersTable.verified,
    })
    .from(communityPostsTable)
    .leftJoin(playersTable, eq(communityPostsTable.authorId, playersTable.id))
    .where(eq(communityPostsTable.id, post.id));

  const enriched = await enrichPosts([withAuthor], req.session.userId);
  res.status(201).json(enriched[0]);
});

// ── DELETE /community/posts/:id ───────────────────────────────────────────────

router.delete("/community/posts/:id", async (req: Request, res: Response) => {
  if (!req.session?.userId) { res.status(401).json({ error: "Login required" }); return; }

  const postId = Number(req.params.id);
  if (isNaN(postId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [post] = await db.select().from(communityPostsTable).where(eq(communityPostsTable.id, postId));
  if (!post) { res.status(404).json({ error: "Post not found" }); return; }
  if (post.authorId !== req.session.userId && !isAdmin(req)) { res.status(403).json({ error: "Forbidden" }); return; }

  await db.delete(communityPostLikesTable).where(eq(communityPostLikesTable.postId, postId));
  await db.delete(communityPostCommentsTable).where(eq(communityPostCommentsTable.postId, postId));
  await db.delete(communityPostsTable).where(eq(communityPostsTable.id, postId));
  res.json({ ok: true });
});

// ── POST /community/posts/:id/likes (toggle) ──────────────────────────────────

router.post("/community/posts/:id/likes", async (req: Request, res: Response) => {
  if (!req.session?.userId) { res.status(401).json({ error: "Login required" }); return; }

  const postId = Number(req.params.id);
  if (isNaN(postId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const userId = req.session.userId;
  const [existing] = await db
    .select()
    .from(communityPostLikesTable)
    .where(and(eq(communityPostLikesTable.postId, postId), eq(communityPostLikesTable.userId, userId)));

  if (existing) {
    await db.delete(communityPostLikesTable).where(eq(communityPostLikesTable.id, existing.id));
    res.json({ liked: false });
  } else {
    await db.insert(communityPostLikesTable).values({ postId, userId });
    res.json({ liked: true });
  }
});

// ── GET /community/posts/:id/comments ─────────────────────────────────────────

router.get("/community/posts/:id/comments", async (req: Request, res: Response) => {
  const postId = Number(req.params.id);
  if (isNaN(postId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const comments = await db
    .select({
      id: communityPostCommentsTable.id,
      postId: communityPostCommentsTable.postId,
      authorId: communityPostCommentsTable.authorId,
      content: communityPostCommentsTable.content,
      createdAt: communityPostCommentsTable.createdAt,
      authorUsername: playersTable.username,
      authorDisplayName: playersTable.displayName,
      authorAvatarUrl: playersTable.avatarUrl,
      authorVerified: playersTable.verified,
    })
    .from(communityPostCommentsTable)
    .leftJoin(playersTable, eq(communityPostCommentsTable.authorId, playersTable.id))
    .where(eq(communityPostCommentsTable.postId, postId))
    .orderBy(communityPostCommentsTable.createdAt);

  res.json(comments.map((c) => ({
    ...c,
    createdAt: c.createdAt instanceof Date ? c.createdAt.toISOString() : c.createdAt,
  })));
});

// ── POST /community/posts/:id/comments ────────────────────────────────────────

router.post("/community/posts/:id/comments", async (req: Request, res: Response) => {
  if (!req.session?.userId) { res.status(401).json({ error: "Login required" }); return; }

  const postId = Number(req.params.id);
  if (isNaN(postId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { content } = req.body ?? {};
  if (!content || typeof content !== "string" || content.trim().length === 0) {
    res.status(400).json({ error: "Content is required" }); return;
  }
  if (content.length > 1000) { res.status(400).json({ error: "Comment too long (max 1000 chars)" }); return; }

  const [comment] = await db
    .insert(communityPostCommentsTable)
    .values({ postId, authorId: req.session.userId, content: content.trim() })
    .returning();

  const [enriched] = await db
    .select({
      id: communityPostCommentsTable.id,
      postId: communityPostCommentsTable.postId,
      authorId: communityPostCommentsTable.authorId,
      content: communityPostCommentsTable.content,
      createdAt: communityPostCommentsTable.createdAt,
      authorUsername: playersTable.username,
      authorDisplayName: playersTable.displayName,
      authorAvatarUrl: playersTable.avatarUrl,
      authorVerified: playersTable.verified,
    })
    .from(communityPostCommentsTable)
    .leftJoin(playersTable, eq(communityPostCommentsTable.authorId, playersTable.id))
    .where(eq(communityPostCommentsTable.id, comment.id));

  res.status(201).json({
    ...enriched,
    createdAt: enriched.createdAt instanceof Date ? enriched.createdAt.toISOString() : enriched.createdAt,
  });
});

// ── DELETE /community/posts/:id/comments/:commentId ───────────────────────────

router.delete("/community/posts/:id/comments/:commentId", async (req: Request, res: Response) => {
  if (!req.session?.userId) { res.status(401).json({ error: "Login required" }); return; }

  const commentId = Number(req.params.commentId);
  if (isNaN(commentId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [comment] = await db.select().from(communityPostCommentsTable).where(eq(communityPostCommentsTable.id, commentId));
  if (!comment) { res.status(404).json({ error: "Comment not found" }); return; }
  if (comment.authorId !== req.session.userId && !isAdmin(req)) { res.status(403).json({ error: "Forbidden" }); return; }

  await db.delete(communityPostCommentsTable).where(eq(communityPostCommentsTable.id, commentId));
  res.json({ ok: true });
});

export default router;
