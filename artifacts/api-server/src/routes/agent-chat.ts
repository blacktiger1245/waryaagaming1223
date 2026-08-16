import { Router, type Request, type Response } from "express";
import { db } from "@workspace/db";
import {
  playersTable,
  agentConversationsTable,
  agentMessagesTable,
} from "@workspace/db";
import {
  eq,
  and,
  desc,
  asc,
  sql,
  isNull,
  inArray,
} from "drizzle-orm";

const router = Router();

/** A player is shown as "online" when their last activity was this recent. */
const ONLINE_WINDOW_MS = 3 * 60 * 1000;
const MAX_MESSAGE_LENGTH = 2000;

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function isOnline(lastSeen: Date | null | undefined): boolean {
  if (!lastSeen) return false;
  const last = lastSeen instanceof Date ? lastSeen.getTime() : new Date(lastSeen).getTime();
  return Date.now() - last < ONLINE_WINDOW_MS;
}

function participantJson(
  p: { id: number; username: string; displayName: string | null; avatarUrl: string | null; country: string | null },
  online: boolean,
) {
  return {
    id: p.id,
    username: p.username,
    displayName: p.displayName,
    avatarUrl: p.avatarUrl,
    country: p.country,
    online,
  };
}

function messageJson(m: typeof agentMessagesTable.$inferSelect) {
  return {
    id: m.id,
    senderRole: m.senderRole,
    text: m.text,
    sentAt: toIso(m.sentAt),
    readAt: toIso(m.readAt),
  };
}

// ── GET /agent-chat/inbox (agent side) ──────────────────────────────────────
// Lists every conversation where the current user is the "agent", showing the
// counterpart player's profile, last message, time, and unread count. Polling
// this endpoint also keeps the agent's online indicator fresh.
router.get("/agent-chat/inbox", async (req: Request, res: Response) => {
  const me = req.session?.userId;
  if (!me) { res.status(401).json({ error: "Login required" }); return; }

  const now = new Date();
  await db
    .update(agentConversationsTable)
    .set({ agentLastSeenAt: now })
    .where(eq(agentConversationsTable.agentPlayerId, me));

  const conversations = await db
    .select()
    .from(agentConversationsTable)
    .where(eq(agentConversationsTable.agentPlayerId, me))
    .orderBy(desc(agentConversationsTable.updatedAt));

  if (conversations.length === 0) {
    res.json({ conversations: [], totalUnread: 0 });
    return;
  }

  const participantIds = new Set<number>();
  for (const conv of conversations) {
    participantIds.add(conv.agentPlayerId);
    participantIds.add(conv.playerId);
  }

  // Latest message per conversation (rows are ordered newest-first).
  const [playerRows, messageRows] = await Promise.all([
    db.select().from(playersTable).where(inArray(playersTable.id, [...participantIds])),
    db
      .select()
      .from(agentMessagesTable)
      .where(inArray(agentMessagesTable.conversationId, conversations.map((c) => c.id)))
      .orderBy(desc(agentMessagesTable.sentAt))
      .limit(500),
  ]);

  const playerMap = new Map(playerRows.map((p) => [p.id, p]));
  const lastPerConv = new Map<number, typeof agentMessagesTable.$inferSelect>();
  for (const m of messageRows) {
    if (!lastPerConv.has(m.conversationId)) lastPerConv.set(m.conversationId, m);
  }

  let totalUnread = 0;
  const summary = conversations.map((conv) => {
    const agentPlayer = playerMap.get(conv.agentPlayerId);
    const player = playerMap.get(conv.playerId);
    const last = lastPerConv.get(conv.id) ?? null;
    totalUnread += conv.unreadByAgent;
    return {
      id: conv.id,
      agentPlayer: agentPlayer ? participantJson(agentPlayer, isOnline(conv.agentLastSeenAt)) : null,
      player: player ? participantJson(player, isOnline(conv.playerLastSeenAt)) : null,
      unreadByAgent: conv.unreadByAgent,
      unreadByPlayer: conv.unreadByPlayer,
      lastMessage: last ? { ...messageJson(last), senderPlayerId: last.senderPlayerId } : null,
      updatedAt: toIso(conv.updatedAt),
    };
  });

  res.json({ conversations: summary, totalUnread });
});

// ── POST /agent-chat/conversations (player side) ────────────────────────────
// Get or create the conversation between the current user and an agent.
// Used when a user clicks "Chat with agent" on a Transfer Market player card.
router.post("/agent-chat/conversations", async (req: Request, res: Response) => {
  const me = req.session?.userId;
  if (!me) { res.status(401).json({ error: "Login required" }); return; }

  const agentPlayerId = Number((req.body as { agentPlayerId?: unknown })?.agentPlayerId);
  if (!Number.isInteger(agentPlayerId) || agentPlayerId <= 0) {
    res.status(400).json({ error: "Invalid agentPlayerId" });
    return;
  }
  if (agentPlayerId === me) {
    res.status(400).json({ error: "You cannot chat with yourself" });
    return;
  }

  const [agentPlayer] = await db
    .select()
    .from(playersTable)
    .where(eq(playersTable.id, agentPlayerId));
  if (!agentPlayer) { res.status(404).json({ error: "Player not found" }); return; }

  let [conv] = await db
    .select()
    .from(agentConversationsTable)
    .where(
      and(
        eq(agentConversationsTable.agentPlayerId, agentPlayerId),
        eq(agentConversationsTable.playerId, me),
      ),
    );

  if (!conv) {
    const inserted = await db
      .insert(agentConversationsTable)
      .values({ agentPlayerId, playerId: me })
      .onConflictDoNothing()
      .returning();
    if (inserted[0]) {
      conv = inserted[0];
    } else {
      [conv] = await db
        .select()
        .from(agentConversationsTable)
        .where(
          and(
            eq(agentConversationsTable.agentPlayerId, agentPlayerId),
            eq(agentConversationsTable.playerId, me),
          ),
        );
    }
  }

  const now = new Date();
  await db
    .update(agentConversationsTable)
    .set({ playerLastSeenAt: now })
    .where(eq(agentConversationsTable.id, conv.id));

  res.json({
    id: conv.id,
    agentPlayer: participantJson(agentPlayer, isOnline(conv.agentLastSeenAt)),
    unreadByAgent: conv.unreadByAgent,
    unreadByPlayer: conv.unreadByPlayer,
    updatedAt: toIso(conv.updatedAt),
  });
});

// ── GET /agent-chat/conversations/:id/messages (both sides) ─────────────────
// Full message thread. Marks the viewer's unread count as 0 and stamps the
// received messages as read (read receipts for the other side).
router.get("/agent-chat/conversations/:id/messages", async (req: Request, res: Response) => {
  const me = req.session?.userId;
  if (!me) { res.status(401).json({ error: "Login required" }); return; }

  const convId = Number(req.params.id);
  if (!Number.isInteger(convId)) { res.status(400).json({ error: "Invalid conversation id" }); return; }

  const [conv] = await db
    .select()
    .from(agentConversationsTable)
    .where(eq(agentConversationsTable.id, convId));
  if (!conv) { res.status(404).json({ error: "Conversation not found" }); return; }

  const meRole =
    conv.playerId === me ? "player" : conv.agentPlayerId === me ? "agent" : null;
  if (!meRole) { res.status(403).json({ error: "Forbidden" }); return; }

  const now = new Date();
  if (meRole === "agent") {
    await db
      .update(agentConversationsTable)
      .set({ unreadByAgent: 0, agentLastSeenAt: now, updatedAt: now })
      .where(eq(agentConversationsTable.id, conv.id));
  } else {
    await db
      .update(agentConversationsTable)
      .set({ unreadByPlayer: 0, playerLastSeenAt: now, updatedAt: now })
      .where(eq(agentConversationsTable.id, conv.id));
  }

  const otherRole = meRole === "agent" ? "player" : "agent";
  await db
    .update(agentMessagesTable)
    .set({ readAt: now })
    .where(
      and(
        eq(agentMessagesTable.conversationId, conv.id),
        eq(agentMessagesTable.senderRole, otherRole),
        isNull(agentMessagesTable.readAt),
      ),
    );

  const [agentRows, playerRows, messages] = await Promise.all([
    db.select().from(playersTable).where(eq(playersTable.id, conv.agentPlayerId)),
    db.select().from(playersTable).where(eq(playersTable.id, conv.playerId)),
    db
      .select()
      .from(agentMessagesTable)
      .where(eq(agentMessagesTable.conversationId, conv.id))
      .orderBy(asc(agentMessagesTable.sentAt)),
  ]);

  const agentPlayer = agentRows[0] ?? null;
  const player = playerRows[0] ?? null;
  const meIsAgent = meRole === "agent";
  const participant = meIsAgent ? player : agentPlayer;

  res.json({
    conversationId: conv.id,
    meRole,
    participant: participant
      ? participantJson(participant, isOnline(meIsAgent ? conv.playerLastSeenAt : conv.agentLastSeenAt))
      : null,
    messages: messages.map(messageJson),
  });
});

// ── POST /agent-chat/conversations/:id/messages (both sides) ────────────────
// Sends a message as the caller's role, bumps the other side's unread count,
// and refreshes the online/updated timestamps.
router.post("/agent-chat/conversations/:id/messages", async (req: Request, res: Response) => {
  const me = req.session?.userId;
  if (!me) { res.status(401).json({ error: "Login required" }); return; }

  const convId = Number(req.params.id);
  if (!Number.isInteger(convId)) { res.status(400).json({ error: "Invalid conversation id" }); return; }

  const body = (req.body ?? {}) as { text?: unknown };
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) { res.status(400).json({ error: "Message text is required" }); return; }
  if (text.length > MAX_MESSAGE_LENGTH) {
    res.status(400).json({ error: `Message too long (max ${MAX_MESSAGE_LENGTH} characters)` });
    return;
  }

  const [conv] = await db
    .select()
    .from(agentConversationsTable)
    .where(eq(agentConversationsTable.id, convId));
  if (!conv) { res.status(404).json({ error: "Conversation not found" }); return; }

  const meRole =
    conv.playerId === me ? "player" : conv.agentPlayerId === me ? "agent" : null;
  if (!meRole) { res.status(403).json({ error: "Forbidden" }); return; }

  const now = new Date();

  const [message] = await db
    .insert(agentMessagesTable)
    .values({ conversationId: conv.id, senderPlayerId: me, senderRole: meRole, text })
    .returning();

  if (meRole === "agent") {
    await db
      .update(agentConversationsTable)
      .set({
        updatedAt: now,
        agentLastSeenAt: now,
        unreadByPlayer: sql`${agentConversationsTable.unreadByPlayer} + 1`,
      })
      .where(eq(agentConversationsTable.id, conv.id));
  } else {
    await db
      .update(agentConversationsTable)
      .set({
        updatedAt: now,
        playerLastSeenAt: now,
        unreadByAgent: sql`${agentConversationsTable.unreadByAgent} + 1`,
      })
      .where(eq(agentConversationsTable.id, conv.id));
  }

  res.status(201).json(messageJson(message));
});

export default router;