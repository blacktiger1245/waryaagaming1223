import { Router, type Request, type Response } from "express";
import { db } from "@workspace/db";
import {
  playersTable,
  agentConversationsTable,
  agentMessagesTable,
  teamsTable,
  playerTransfersTable,
  seasonsTable,
} from "@workspace/db";
import {
  eq,
  and,
  or,
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


// ── Team-invite helpers ────────────────────────────────────────────────────────
// We reuse the message TEXT column to carry structured invite/result payloads so
// the feature needs no schema migration. Regular messages are plain text; invite
// and result "cards" are serialized JSON starting with a sentinel kind.

interface WgInvitePayload {
  kind: "wg_invite";
  inviteId: number;
  teamId: number;
  teamName: string;
  presidentName: string;
  /** Contract length in seasons offered with this invitation (1 or 2). */
  seasons: number;
}

interface WgInviteResultPayload {
  kind: "wg_invite_result";
  inviteId: number;
  accepted: boolean;
  teamName: string;
  agentName: string;
}

type WgSystemPayload = WgInvitePayload | WgInviteResultPayload;

function parseSystemMessage(text: string): WgSystemPayload | null {
  try {
    const parsed = JSON.parse(text);
    if (parsed && (parsed.kind === "wg_invite" || parsed.kind === "wg_invite_result")) {
      return parsed as WgSystemPayload;
    }
  } catch {
    /* not a system message */
  }
  return null;
}

function isSystemMessage(m: { text: string }): boolean {
  return parseSystemMessage(m.text) !== null;
}

/** Friendly one-line preview used for inbox last-message summaries. */
function friendlySystemText(m: { text: string; senderRole: string | null }): string | null {
  const sys = parseSystemMessage(m.text);
  if (!sys) return null;
  if (sys.kind === "wg_invite") {
    return `Invitation to join ${sys.teamName}`;
  }
  return sys.accepted
    ? `${sys.agentName} accepted the invitation to ${sys.teamName}`
    : `${sys.agentName} rejected the invitation to ${sys.teamName}`;
}

/**
 * Resolve the authenticated user's leadership context (president or coach of a
 * team). Returns null when the user has no president/coach role anywhere.
 */
async function resolveLeaderContext(
  me: number,
): Promise<{ role: "president" | "coach"; teamId: number; teamName: string } | null> {
  const teams = await db
    .select({ id: teamsTable.id, name: teamsTable.name, presidentId: teamsTable.presidentId, coachId: teamsTable.coachId })
    .from(teamsTable)
    .where(or(eq(teamsTable.presidentId, me), eq(teamsTable.coachId, me)))
    .limit(1);
  const team = teams[0];
  if (!team) return null;
  return {
    role: team.presidentId === me ? "president" : "coach",
    teamId: team.id,
    teamName: team.name,
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

// ── GET /agent-chat/inbox (both sides) ──────────────────────────────────────
// Lists every conversation where the current user is either the agent or the
// player, showing the counterpart's profile, last message, time, and the
// caller's unread count. Polling keeps both online indicators fresh.
router.get("/agent-chat/inbox", async (req: Request, res: Response) => {
  const me = req.session?.userId;
  if (!me) { res.status(401).json({ error: "Login required" }); return; }

  const now = new Date();
  // Keep both online indicators fresh (whichever side the caller is).
  await db
    .update(agentConversationsTable)
    .set({ agentLastSeenAt: now })
    .where(eq(agentConversationsTable.agentPlayerId, me));
  await db
    .update(agentConversationsTable)
    .set({ playerLastSeenAt: now })
    .where(eq(agentConversationsTable.playerId, me));

  const conversations = await db
    .select()
    .from(agentConversationsTable)
    .where(
      or(
        eq(agentConversationsTable.agentPlayerId, me),
        eq(agentConversationsTable.playerId, me),
      ),
    )
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
    const meRole = conv.playerId === me ? "player" : "agent";
    const agentPlayer = playerMap.get(conv.agentPlayerId);
    const player = playerMap.get(conv.playerId);
    const counterpart = meRole === "agent" ? player : agentPlayer;
    const unread = meRole === "agent" ? conv.unreadByAgent : conv.unreadByPlayer;
    const last = lastPerConv.get(conv.id) ?? null;
    totalUnread += unread;
    return {
      id: conv.id,
      meRole,
      counterpart: counterpart
        ? participantJson(
            counterpart,
            isOnline(meRole === "agent" ? conv.playerLastSeenAt : conv.agentLastSeenAt),
          )
        : null,
      agentPlayer: agentPlayer ? participantJson(agentPlayer, isOnline(conv.agentLastSeenAt)) : null,
      player: player ? participantJson(player, isOnline(conv.playerLastSeenAt)) : null,
      unread,
      unreadByAgent: conv.unreadByAgent,
      unreadByPlayer: conv.unreadByPlayer,
      lastMessage: last
        ? {
            ...messageJson(last),
            senderPlayerId: last.senderPlayerId,
            // System invite/result cards get a friendly one-line preview instead
            // of showing raw JSON in the conversation list.
            text: friendlySystemText(last) ?? last.text,
          }
        : null,
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

  // Only a team President or Coach may start a chat with a player's agent.
  const leader = await resolveLeaderContext(me);
  if (!leader) {
    res.status(403).json({ error: "You are not a President or Coach in a team" });
    return;
  }

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

  // Only a team President or Coach may send as the "player" side.
  if (meRole === "player") {
    const leader = await resolveLeaderContext(me);
    if (!leader) {
      res.status(403).json({ error: "You are not a President or Coach in a team" });
      return;
    }
  }

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

// ── GET /agent-chat/unread-count (both sides) ───────────────────────────────
// Lightweight total unread for the current user (either side), used by the
// header notification badge. Does not touch online/last-seen timestamps.
router.get("/agent-chat/unread-count", async (req: Request, res: Response) => {
  const me = req.session?.userId;
  if (!me) { res.status(401).json({ error: "Login required" }); return; }

  const conversations = await db
    .select()
    .from(agentConversationsTable)
    .where(
      or(
        eq(agentConversationsTable.agentPlayerId, me),
        eq(agentConversationsTable.playerId, me),
      ),
    );

  const totalUnread = conversations.reduce(
    (sum, conv) => sum + (conv.playerId === me ? conv.unreadByPlayer : conv.unreadByAgent),
    0,
  );

  res.json({ totalUnread });
});

// ── GET /agent-chat/me (current user's leadership context) ─────────────────
router.get("/agent-chat/me", async (req: Request, res: Response) => {
  const me = req.session?.userId;
  if (!me) { res.status(401).json({ error: "Login required" }); return; }

  const leader = await resolveLeaderContext(me);
  res.json({
    isLeader: leader !== null,
    role: leader?.role ?? null,
    teamId: leader?.teamId ?? null,
    teamName: leader?.teamName ?? null,
  });
});

// ── POST /agent-chat/conversations/:id/invite (player side) ─────────────────
router.post("/agent-chat/conversations/:id/invite", async (req: Request, res: Response) => {
  const me = req.session?.userId;
  if (!me) { res.status(401).json({ error: "Login required" }); return; }

  const convId = Number(req.params.id);
  if (!Number.isInteger(convId)) { res.status(400).json({ error: "Invalid conversation id" }); return; }

  const [conv] = await db.select().from(agentConversationsTable).where(eq(agentConversationsTable.id, convId));
  if (!conv) { res.status(404).json({ error: "Conversation not found" }); return; }
  if (conv.playerId !== me) { res.status(403).json({ error: "Only the player side may invite" }); return; }

  const leader = await resolveLeaderContext(me);
  if (!leader) {
    res.status(403).json({ error: "You are not a President or Coach in a team" });
    return;
  }

  const [meRow] = await db
    .select({ displayName: playersTable.displayName, username: playersTable.username })
    .from(playersTable)
    .where(eq(playersTable.id, me));
  const presidentName = meRow?.displayName ?? meRow?.username ?? me.toString();

  // The President/Coach must choose the contract length (1 or 2 seasons).
  const rawSeasons = (req.body as { seasons?: unknown })?.seasons;
  const seasons = typeof rawSeasons === "string" ? Number(rawSeasons) : rawSeasons;
  if (seasons !== 1 && seasons !== 2) {
    res.status(400).json({ error: "You must select a contract length of 1 or 2 seasons" });
    return;
  }

  const payload: WgInvitePayload = {
    kind: "wg_invite",
    inviteId: -1,
    teamId: leader.teamId,
    teamName: leader.teamName,
    presidentName,
    seasons,
  };

  const [inserted] = await db
    .insert(agentMessagesTable)
    .values({ conversationId: conv.id, senderPlayerId: me, senderRole: "player", text: JSON.stringify(payload) })
    .returning();

  const finalText = JSON.stringify({ ...payload, inviteId: inserted.id });
  await db
    .update(agentMessagesTable)
    .set({ text: finalText })
    .where(eq(agentMessagesTable.id, inserted.id));

  const now = new Date();
  await db
    .update(agentConversationsTable)
    .set({ updatedAt: now, agentLastSeenAt: now, unreadByAgent: sql`${agentConversationsTable.unreadByAgent} + 1` })
    .where(eq(agentConversationsTable.id, conv.id));

  res.status(201).json({ ...messageJson({ ...inserted, text: finalText }), sys: JSON.parse(finalText) });
});

// ── POST /agent-chat/invites/:messageId/respond (agent side) ───────────────
router.post("/agent-chat/invites/:messageId/respond", async (req: Request, res: Response) => {
  const me = req.session?.userId;
  if (!me) { res.status(401).json({ error: "Login required" }); return; }

  const messageId = Number(req.params.messageId);
  if (!Number.isInteger(messageId)) { res.status(400).json({ error: "Invalid message id" }); return; }

  const decision = (req.body as { decision?: unknown })?.decision;
  if (decision !== "accept" && decision !== "reject") {
    res.status(400).json({ error: "decision must be accept or reject" });
    return;
  }

  const [inviteMsg] = await db
    .select()
    .from(agentMessagesTable)
    .where(eq(agentMessagesTable.id, messageId));
  if (!inviteMsg) { res.status(404).json({ error: "Invitation not found" }); return; }

  const [conv] = await db
    .select()
    .from(agentConversationsTable)
    .where(eq(agentConversationsTable.id, inviteMsg.conversationId));
  if (!conv) { res.status(404).json({ error: "Conversation not found" }); return; }
  if (conv.agentPlayerId !== me) { res.status(403).json({ error: "Only the invited player may respond" }); return; }

  const sys = parseSystemMessage(inviteMsg.text);
  if (!sys || sys.kind !== "wg_invite") {
    res.status(400).json({ error: "Message is not a valid invitation" });
    return;
  }

  // Prevent a double response: if a result for this invitation already exists,
  // refuse to process it again.
  const prior = await db
    .select({ id: agentMessagesTable.id, text: agentMessagesTable.text })
    .from(agentMessagesTable)
    .where(and(eq(agentMessagesTable.conversationId, conv.id), eq(agentMessagesTable.senderRole, "system")));
  const alreadyResolved = prior.some((r) => {
    const s = parseSystemMessage(r.text);
    return s?.kind === "wg_invite_result" && s.inviteId === sys.inviteId;
  });
  if (alreadyResolved) {
    res.status(409).json({ error: "This invitation has already been answered" });
    return;
  }

  const accepted = decision === "accept";

  if (accepted) {
    // Verify the destination team still exists.
    const [team] = await db.select({ id: teamsTable.id }).from(teamsTable).where(eq(teamsTable.id, sys.teamId));
    if (!team) { res.status(404).json({ error: "The team no longer exists" }); return; }
    const [target] = await db.select().from(playersTable).where(eq(playersTable.id, me));
    if (!target) { res.status(404).json({ error: "Player not found" }); return; }
    if (target.teamId != null) {
      res.status(409).json({ error: "You are already on a team" });
      return;
    }
    await db
      .update(playersTable)
      .set({ teamId: sys.teamId, isFreeAgent: false })
      .where(eq(playersTable.id, me));
    await db
      .insert(playerTransfersTable)
      .values({ playerId: me, fromTeamId: null, toTeamId: sys.teamId });

    // Sign the contract: record the offered length and the season it was
    // signed in. Each time an admin ends the current season the remaining
    // count is decremented; at 0 the player becomes a free agent again.
    const [currentSeason] = await db
      .select({ id: seasonsTable.id })
      .from(seasonsTable)
      .where(eq(seasonsTable.isCurrent, true))
      .limit(1);
    await db
      .update(playersTable)
      .set({
        contractSeasons: sys.seasons,
        contractSeasonsLeft: sys.seasons,
        contractSignedSeasonId: currentSeason?.id ?? null,
      })
      .where(eq(playersTable.id, me));
  }

  const [meRow] = await db
    .select({ displayName: playersTable.displayName, username: playersTable.username })
    .from(playersTable)
    .where(eq(playersTable.id, me));
  const agentName = meRow?.displayName ?? meRow?.username ?? me.toString();

  const result: WgInviteResultPayload = {
    kind: "wg_invite_result",
    inviteId: sys.inviteId,
    accepted,
    teamName: sys.teamName,
    agentName,
  };

  const [resMsg] = await db
    .insert(agentMessagesTable)
    .values({ conversationId: conv.id, senderPlayerId: me, senderRole: "system", text: JSON.stringify(result) })
    .returning();

  const now = new Date();
  await db
    .update(agentConversationsTable)
    .set({ updatedAt: now, playerLastSeenAt: now, unreadByPlayer: sql`${agentConversationsTable.unreadByPlayer} + 1` })
    .where(eq(agentConversationsTable.id, conv.id));

  res.status(201).json({ ...messageJson(resMsg), sys: result });
});

export default router;