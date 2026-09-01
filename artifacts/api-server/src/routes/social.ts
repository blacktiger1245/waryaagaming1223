import { Router, type Request, type Response } from "express";
import { db, pool } from "@workspace/db";
import {
  playerFollowsTable,
  directMessagesTable,
  teamChatMessagesTable,
  playersTable,
  teamsTable,
} from "@workspace/db";
import { and, desc, eq, or, sql } from "drizzle-orm";

const router = Router();

// ── Schema bootstrap (idempotent, runs once per process) ──────────────────────
let schemaReady: Promise<void> | null = null;
function ensureSocialSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      await pool.query(`CREATE TABLE IF NOT EXISTS "player_follows" (
        "id" serial PRIMARY KEY,
        "follower_id" integer NOT NULL,
        "following_id" integer NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "player_follows_pair_unique" UNIQUE ("follower_id","following_id")
      )`);
      await pool.query(`CREATE TABLE IF NOT EXISTS "direct_messages" (
        "id" serial PRIMARY KEY,
        "sender_id" integer NOT NULL,
        "recipient_id" integer NOT NULL,
        "content" text NOT NULL,
        "read_at" timestamp,
        "created_at" timestamp DEFAULT now() NOT NULL
      )`);
      await pool.query(`CREATE TABLE IF NOT EXISTS "team_chat_messages" (
        "id" serial PRIMARY KEY,
        "team_id" integer NOT NULL,
        "sender_id" integer NOT NULL,
        "content" text NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL
      )`);
    })().catch((err) => {
      schemaReady = null; // allow retry on next request
      throw err;
    });
  }
  return schemaReady;
}

function iso(v: Date | string | null | undefined): string | null {
  if (!v) return null;
  return v instanceof Date ? v.toISOString() : new Date(v).toISOString();
}

const authorCols = {
  id: playersTable.id,
  username: playersTable.username,
  displayName: playersTable.displayName,
  avatarUrl: playersTable.avatarUrl,
  verified: playersTable.verified,
};

// ── Follows ───────────────────────────────────────────────────────────────────

// GET /players/:id/follow — follow status for the logged-in viewer
router.get("/players/:id/follow", async (req: Request, res: Response) => {
  await ensureSocialSchema();
  const targetId = Number(req.params.id);
  if (isNaN(targetId)) { res.status(400).json({ error: "Invalid id" }); return; }
  const viewerId: number | null = req.session?.userId ?? null;

  const [followers, following, isFollowing] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` }).from(playerFollowsTable).where(eq(playerFollowsTable.followingId, targetId)),
    db.select({ count: sql<number>`count(*)::int` }).from(playerFollowsTable).where(eq(playerFollowsTable.followerId, targetId)),
    viewerId && viewerId !== targetId
      ? db.select({ id: playerFollowsTable.id }).from(playerFollowsTable)
          .where(and(eq(playerFollowsTable.followerId, viewerId), eq(playerFollowsTable.followingId, targetId)))
      : Promise.resolve([] as { id: number }[]),
  ]);

  res.json({
    following: isFollowing.length > 0,
    followerCount: followers[0]?.count ?? 0,
    followingCount: following[0]?.count ?? 0,
  });
});

// POST /players/:id/follow — follow a player
router.post("/players/:id/follow", async (req: Request, res: Response) => {
  await ensureSocialSchema();
  if (!req.session?.userId) { res.status(401).json({ error: "Login required" }); return; }
  const targetId = Number(req.params.id);
  const viewerId = req.session.userId;
  if (isNaN(targetId)) { res.status(400).json({ error: "Invalid id" }); return; }
  if (targetId === viewerId) { res.status(400).json({ error: "You cannot follow yourself" }); return; }

  const [target] = await db.select({ id: playersTable.id }).from(playersTable).where(eq(playersTable.id, targetId));
  if (!target) { res.status(404).json({ error: "Player not found" }); return; }

  await db.insert(playerFollowsTable).values({ followerId: viewerId, followingId: targetId }).onConflictDoNothing();
  const [c] = await db.select({ count: sql<number>`count(*)::int` }).from(playerFollowsTable).where(eq(playerFollowsTable.followingId, targetId));
  res.status(201).json({ following: true, followerCount: c?.count ?? 0 });
});

// DELETE /players/:id/follow — unfollow a player
router.delete("/players/:id/follow", async (req: Request, res: Response) => {
  await ensureSocialSchema();
  if (!req.session?.userId) { res.status(401).json({ error: "Login required" }); return; }
  const targetId = Number(req.params.id);
  if (isNaN(targetId)) { res.status(400).json({ error: "Invalid id" }); return; }

  await db.delete(playerFollowsTable)
    .where(and(eq(playerFollowsTable.followerId, req.session.userId), eq(playerFollowsTable.followingId, targetId)));
  const [c] = await db.select({ count: sql<number>`count(*)::int` }).from(playerFollowsTable).where(eq(playerFollowsTable.followingId, targetId));
  res.json({ following: false, followerCount: c?.count ?? 0 });
});

// GET /players/:id/followers — list of players following this player
router.get("/players/:id/followers", async (req: Request, res: Response) => {
  await ensureSocialSchema();
  const targetId = Number(req.params.id);
  if (isNaN(targetId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const rows = await db
    .select({ ...authorCols, followedAt: playerFollowsTable.createdAt })
    .from(playerFollowsTable)
    .innerJoin(playersTable, eq(playerFollowsTable.followerId, playersTable.id))
    .where(eq(playerFollowsTable.followingId, targetId))
    .orderBy(desc(playerFollowsTable.createdAt))
    .limit(100);

  res.json(rows.map((r) => ({ ...r, followedAt: iso(r.followedAt) })));
});

// ── Direct messages ───────────────────────────────────────────────────────────

// GET /messages/inbox — messages received, newest per conversation partner
router.get("/messages/inbox", async (req: Request, res: Response) => {
  await ensureSocialSchema();
  if (!req.session?.userId) { res.status(401).json({ error: "Login required" }); return; }
  const me = req.session.userId;

  const rows = await db
    .select({
      id: directMessagesTable.id,
      senderId: directMessagesTable.senderId,
      recipientId: directMessagesTable.recipientId,
      content: directMessagesTable.content,
      readAt: directMessagesTable.readAt,
      createdAt: directMessagesTable.createdAt,
      sender: authorCols,
    })
    .from(directMessagesTable)
    .innerJoin(playersTable, eq(directMessagesTable.senderId, playersTable.id))
    .where(eq(directMessagesTable.recipientId, me))
    .orderBy(desc(directMessagesTable.createdAt))
    .limit(200);

  const byPartner = new Map<number, (typeof rows)[number]>();
  for (const r of rows) {
    if (!byPartner.has(r.senderId)) byPartner.set(r.senderId, r);
  }
  res.json([...byPartner.values()].map((r) => ({
    id: r.id,
    partnerId: r.senderId,
    partner: r.sender,
    content: r.content,
    readAt: iso(r.readAt),
    createdAt: iso(r.createdAt),
  })));
});

// GET /messages/sent — messages sent, newest per recipient
router.get("/messages/sent", async (req: Request, res: Response) => {
  await ensureSocialSchema();
  if (!req.session?.userId) { res.status(401).json({ error: "Login required" }); return; }
  const me = req.session.userId;

  const rows = await db
    .select({
      id: directMessagesTable.id,
      senderId: directMessagesTable.senderId,
      recipientId: directMessagesTable.recipientId,
      content: directMessagesTable.content,
      createdAt: directMessagesTable.createdAt,
      recipient: authorCols,
    })
    .from(directMessagesTable)
    .innerJoin(playersTable, eq(directMessagesTable.recipientId, playersTable.id))
    .where(eq(directMessagesTable.senderId, me))
    .orderBy(desc(directMessagesTable.createdAt))
    .limit(200);

  const byPartner = new Map<number, (typeof rows)[number]>();
  for (const r of rows) {
    if (!byPartner.has(r.recipientId)) byPartner.set(r.recipientId, r);
  }
  res.json([...byPartner.values()].map((r) => ({
    id: r.id,
    partnerId: r.recipientId,
    partner: r.recipient,
    content: r.content,
    createdAt: iso(r.createdAt),
  })));
});

// GET /messages/thread/:playerId — full conversation with one player
router.get("/messages/thread/:playerId", async (req: Request, res: Response) => {
  await ensureSocialSchema();
  if (!req.session?.userId) { res.status(401).json({ error: "Login required" }); return; }
  const me = req.session.userId;
  const otherId = Number(req.params.playerId);
  if (isNaN(otherId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const rows = await db
    .select({
      id: directMessagesTable.id,
      senderId: directMessagesTable.senderId,
      recipientId: directMessagesTable.recipientId,
      content: directMessagesTable.content,
      createdAt: directMessagesTable.createdAt,
    })
    .from(directMessagesTable)
    .where(
      or(
        and(eq(directMessagesTable.senderId, me), eq(directMessagesTable.recipientId, otherId)),
        and(eq(directMessagesTable.senderId, otherId), eq(directMessagesTable.recipientId, me)),
      ),
    )
    .orderBy(directMessagesTable.createdAt)
    .limit(500);

  // Mark incoming messages as read
  await db.update(directMessagesTable)
    .set({ readAt: new Date() })
    .where(and(
      eq(directMessagesTable.senderId, otherId),
      eq(directMessagesTable.recipientId, me),
      sql`${directMessagesTable.readAt} IS NULL`,
    ));

  res.json(rows.map((r) => ({ ...r, createdAt: iso(r.createdAt), mine: r.senderId === me })));
});

// POST /messages/:playerId — send a direct message
router.post("/messages/:playerId", async (req: Request, res: Response) => {
  await ensureSocialSchema();
  if (!req.session?.userId) { res.status(401).json({ error: "Login required" }); return; }
  const me = req.session.userId;
  const otherId = Number(req.params.playerId);
  if (isNaN(otherId)) { res.status(400).json({ error: "Invalid id" }); return; }
  if (otherId === me) { res.status(400).json({ error: "You cannot message yourself" }); return; }

  const { content } = req.body ?? {};
  if (!content || typeof content !== "string" || content.trim().length === 0) {
    res.status(400).json({ error: "Message content is required" }); return;
  }
  if (content.length > 2000) { res.status(400).json({ error: "Message too long (max 2000 chars)" }); return; }

  const [target] = await db.select({ id: playersTable.id }).from(playersTable).where(eq(playersTable.id, otherId));
  if (!target) { res.status(404).json({ error: "Player not found" }); return; }

  const [msg] = await db.insert(directMessagesTable)
    .values({ senderId: me, recipientId: otherId, content: content.trim() })
    .returning();

  res.status(201).json({ ...msg, createdAt: iso(msg.createdAt), mine: true });
});

// ── Team chat (members only) ──────────────────────────────────────────────────

async function isTeamMember(teamId: number, playerId: number): Promise<boolean> {
  const [team] = await db.select().from(teamsTable).where(eq(teamsTable.id, teamId));
  if (!team) return false;
  if (team.presidentId === playerId || team.captainId === playerId || team.coachId === playerId) return true;
  const [member] = await db.select({ id: playersTable.id }).from(playersTable)
    .where(and(eq(playersTable.id, playerId), eq(playersTable.teamId, teamId)));
  return !!member;
}

// GET /teams/:id/chat — team members only
router.get("/teams/:id/chat", async (req: Request, res: Response) => {
  await ensureSocialSchema();
  if (!req.session?.userId) { res.status(401).json({ error: "Login required" }); return; }
  const teamId = Number(req.params.id);
  const me = req.session.userId;
  if (isNaN(teamId)) { res.status(400).json({ error: "Invalid team id" }); return; }

  if (!(await isTeamMember(teamId, me))) {
    res.status(403).json({ error: "Only team members can read the team chat" }); return;
  }

  const rows = await db
    .select({
      id: teamChatMessagesTable.id,
      senderId: teamChatMessagesTable.senderId,
      content: teamChatMessagesTable.content,
      createdAt: teamChatMessagesTable.createdAt,
      sender: authorCols,
    })
    .from(teamChatMessagesTable)
    .innerJoin(playersTable, eq(teamChatMessagesTable.senderId, playersTable.id))
    .where(eq(teamChatMessagesTable.teamId, teamId))
    .orderBy(desc(teamChatMessagesTable.id))
    .limit(100);

  res.json(rows.reverse().map((r) => ({ ...r, createdAt: iso(r.createdAt), mine: r.senderId === me })));
});

// POST /teams/:id/chat — team members only
router.post("/teams/:id/chat", async (req: Request, res: Response) => {
  await ensureSocialSchema();
  if (!req.session?.userId) { res.status(401).json({ error: "Login required" }); return; }
  const teamId = Number(req.params.id);
  const me = req.session.userId;
  if (isNaN(teamId)) { res.status(400).json({ error: "Invalid team id" }); return; }

  if (!(await isTeamMember(teamId, me))) {
    res.status(403).json({ error: "Only team members can write in the team chat" }); return;
  }

  const { content } = req.body ?? {};
  if (!content || typeof content !== "string" || content.trim().length === 0) {
    res.status(400).json({ error: "Message content is required" }); return;
  }
  if (content.length > 1000) { res.status(400).json({ error: "Message too long (max 1000 chars)" }); return; }

  const [msg] = await db.insert(teamChatMessagesTable)
    .values({ teamId, senderId: me, content: content.trim() })
    .returning();

  const [sender] = await db.select(authorCols).from(playersTable).where(eq(playersTable.id, me));
  res.status(201).json({ ...msg, createdAt: iso(msg.createdAt), mine: true, sender });
});

export default router;