import { Router, type Request, type Response } from "express";
import { db } from "@workspace/db";
import {
  playersTable,
  agentConversationsTable,
  agentMessagesTable,
  teamsTable,
  playerTransfersTable,
  seasonsTable,
  coinSpendsTable,
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
  p: {
    id: number;
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
    country: string | null;
    marketValue?: number | null;
  },
  online: boolean,
) {
  return {
    id: p.id,
    username: p.username,
    displayName: p.displayName,
    avatarUrl: p.avatarUrl,
    country: p.country,
    online,
    // The player's Market Value (in M coins) is what a signing costs, so the
    // chat can price the contract offer before it is sent.
    marketValue: Number(p.marketValue ?? 0),
  };
}

/**
 * Market Value is measured in M (millions) of WG Coins — the same unit as the
 * coin packages and the clan-role prices — so a player listed at 120 has a
 * signing fee of 120,000,000 WG Coins.
 */
const COINS_PER_MARKET_VALUE_M = 1_000_000;

/** Signing fee, in WG Coins, for a player whose Market Value is `m` millions. */
function signingFeeCoins(marketValueM: number | null | undefined): number {
  const value = Math.max(0, Math.floor(Number(marketValueM ?? 0)));
  return value * COINS_PER_MARKET_VALUE_M;
}

/** Locked player row, read with raw SQL so the balance can be checked safely. */
type LockedPlayerRow = {
  id: number;
  username: string;
  display_name: string | null;
  team_id: number | null;
  coin_balance: number;
  market_value: number;
};

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Error carrying an HTTP status, thrown from inside a transaction. */
function httpError(status: number, message: string): Error {
  const err = new Error(message) as Error & { status?: number };
  err.status = status;
  return err;
}


// ── Team-invite helpers ────────────────────────────────────────────────────────
// We reuse the message TEXT column to carry structured invite/result payloads so
// the feature needs no schema migration. Regular messages are plain text; invite
// and result "cards" are serialized JSON starting with a sentinel kind.
//
// Signing a player costs their Market Value in WG Coins (`feeCoins`), so a
// completed deal is three cards: the offer (`wg_invite`), the player's answer
// (`wg_invite_result`) and — once the clan has paid the fee — the transfer
// confirmation (`wg_transfer_paid`).

interface WgInvitePayload {
  kind: "wg_invite";
  inviteId: number;
  teamId: number;
  teamName: string;
  presidentName: string;
  /** Contract length in seasons offered with this invitation (1 or 2). */
  seasons: number;
  /** Market Value of the player, in M coins — the price of the offer. */
  marketValueM: number;
  /** Signing fee in WG Coins the offering clan must pay (0 = free signing). */
  feeCoins: number;
}

interface WgInviteResultPayload {
  kind: "wg_invite_result";
  inviteId: number;
  accepted: boolean;
  teamName: string;
  agentName: string;
  /** Signing fee that still has to be paid before the player joins (0 = free). */
  feeCoins: number;
  /** Accepted, but the clan has not paid the fee yet — the player is not signed. */
  awaitingPayment: boolean;
  /** The clan the player belonged to when he accepted (null = he was a free agent). */
  fromTeamId: number | null;
}

/** Written once the clan has paid the fee and the player has joined. */
interface WgTransferPaidPayload {
  kind: "wg_transfer_paid";
  inviteId: number;
  teamId: number;
  teamName: string;
  playerId: number;
  playerName: string;
  buyerName: string;
  feeCoins: number;
  fromTeamName: string | null;
}

type WgSystemPayload = WgInvitePayload | WgInviteResultPayload | WgTransferPaidPayload;

function parseSystemMessage(text: string): WgSystemPayload | null {
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed.kind !== "string") return null;
    if (parsed.kind === "wg_invite") {
      // Offers written before paid signings existed carry no fee fields.
      return {
        ...parsed,
        marketValueM: Number(parsed.marketValueM ?? 0),
        feeCoins: Number(parsed.feeCoins ?? 0),
      } as WgInvitePayload;
    }
    if (parsed.kind === "wg_invite_result") {
      return {
        ...parsed,
        feeCoins: Number(parsed.feeCoins ?? 0),
        awaitingPayment: Boolean(parsed.awaitingPayment),
        fromTeamId: parsed.fromTeamId ?? null,
      } as WgInviteResultPayload;
    }
    if (parsed.kind === "wg_transfer_paid") {
      return { ...parsed, feeCoins: Number(parsed.feeCoins ?? 0) } as WgTransferPaidPayload;
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
    return `Contract offer from ${sys.teamName}`;
  }
  if (sys.kind === "wg_transfer_paid") {
    return `${sys.playerName} joined ${sys.teamName}`;
  }
  if (sys.awaitingPayment) {
    return `${sys.agentName} agreed — the signing fee has to be paid`;
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
  // The balance travels with the leadership context so the chat can show a
  // President/Coach whether a signing fee is affordable before he offers it.
  const [wallet] = await db
    .select({ coinBalance: playersTable.coinBalance })
    .from(playersTable)
    .where(eq(playersTable.id, me));
  res.json({
    isLeader: leader !== null,
    role: leader?.role ?? null,
    teamId: leader?.teamId ?? null,
    teamName: leader?.teamName ?? null,
    coinBalance: Number(wallet?.coinBalance ?? 0),
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
    .select({
      displayName: playersTable.displayName,
      username: playersTable.username,
      coinBalance: playersTable.coinBalance,
    })
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

  // Signing costs the player's Market Value in WG Coins. The price is resolved
  // here, from the database — never from the client — and the clan must already
  // hold enough coins, because the fee is charged when the player agrees.
  const [target] = await db
    .select({
      id: playersTable.id,
      username: playersTable.username,
      displayName: playersTable.displayName,
      teamId: playersTable.teamId,
      marketValue: playersTable.marketValue,
    })
    .from(playersTable)
    .where(eq(playersTable.id, conv.agentPlayerId));
  if (!target) { res.status(404).json({ error: "Player not found" }); return; }
  if (target.teamId === leader.teamId) {
    res.status(409).json({ error: "That player is already in your clan" });
    return;
  }

  const marketValueM = Math.max(0, Number(target.marketValue ?? 0));
  const feeCoins = signingFeeCoins(marketValueM);
  const myBalance = Number(meRow?.coinBalance ?? 0);
  if (feeCoins > 0 && myBalance < feeCoins) {
    res.status(402).json({
      error: `Not enough WG Coins: signing ${target.displayName ?? target.username} costs ${marketValueM}M and your balance is ${Math.floor(myBalance / COINS_PER_MARKET_VALUE_M)}M. Buy WG Coins first.`,
      code: "insufficient_coins",
      feeCoins,
      balance: myBalance,
    });
    return;
  }

  const payload: WgInvitePayload = {
    kind: "wg_invite",
    inviteId: -1,
    teamId: leader.teamId,
    teamName: leader.teamName,
    presidentName,
    seasons,
    marketValueM,
    feeCoins,
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
  const feeCoins = sys.feeCoins;
  // A paid signing is only AGREED to here — the player still has to be signed by
  // the clan paying his Market Value (POST /agent-chat/invites/:messageId/pay).
  const awaitingPayment = accepted && feeCoins > 0;
  let fromTeamId: number | null = null;

  if (accepted) {
    // Verify the destination team still exists.
    const [team] = await db.select({ id: teamsTable.id }).from(teamsTable).where(eq(teamsTable.id, sys.teamId));
    if (!team) { res.status(404).json({ error: "The team no longer exists" }); return; }
    const [target] = await db.select().from(playersTable).where(eq(playersTable.id, me));
    if (!target) { res.status(404).json({ error: "Player not found" }); return; }
    if (target.teamId === sys.teamId) {
      res.status(409).json({ error: "You are already in that clan" });
      return;
    }

    if (awaitingPayment) {
      // The player may be under contract with another clan: agreeing means he
      // moves once the fee is paid. The clan he is leaving is recorded, so a
      // stale offer can never sign him after he has moved somewhere else.
      fromTeamId = target.teamId ?? null;
      if (target.teamId != null) {
        const [current] = await db
          .select({ name: teamsTable.name, presidentId: teamsTable.presidentId })
          .from(teamsTable)
          .where(eq(teamsTable.id, target.teamId));
        if (current && current.presidentId === me) {
          res.status(403).json({
            error: `You are the President of ${current.name} — transfer ownership before another clan can sign you.`,
            code: "clan_president_cannot_be_signed",
          });
          return;
        }
      }
    } else {
      // Free signings stay as they were: only a player without a clan can join.
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
    feeCoins,
    awaitingPayment,
    fromTeamId,
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

// ── POST /agent-chat/invites/:messageId/pay (buyer side) ─────────────────────
// Signs a player who has already agreed to a contract offer. The fee is the
// player's Market Value in WG Coins (resolved server-side when the offer was
// sent), it is charged to the President/Coach who made the offer, and the player
// joins the clan — all in ONE transaction, so a double tap can never charge twice
// or sign twice. Repeat payments are impossible by construction as well: the
// completed deal is recorded as a `wg_transfer_paid` card in the thread.
router.post("/agent-chat/invites/:messageId/pay", async (req: Request, res: Response) => {
  const me = req.session?.userId;
  if (!me) { res.status(401).json({ error: "Login required" }); return; }

  const messageId = Number(req.params.messageId);
  if (!Number.isInteger(messageId)) { res.status(400).json({ error: "Invalid message id" }); return; }

  try {
    const paid = await db.transaction(async (tx) => {
      // Lock the offer first: two concurrent taps are serialised here.
      const lockedInvite = await tx.execute(
        sql`SELECT id, conversation_id, text FROM agent_messages WHERE id = ${messageId} FOR UPDATE`,
      );
      const inviteRow = ((lockedInvite as unknown as {
        rows: { id: number; conversation_id: number; text: string }[];
      }).rows ?? [])[0];
      if (!inviteRow) throw httpError(404, "Contract offer not found");

      const offer = parseSystemMessage(inviteRow.text);
      if (!offer || offer.kind !== "wg_invite") throw httpError(400, "That message is not a contract offer");
      if (offer.feeCoins <= 0) throw httpError(400, "This offer is a free signing — nothing to pay");

      const [conv] = await tx
        .select()
        .from(agentConversationsTable)
        .where(eq(agentConversationsTable.id, inviteRow.conversation_id));
      if (!conv) throw httpError(404, "Conversation not found");
      if (conv.playerId !== me) throw httpError(403, "Only the clan that made the offer can pay it");

      // The caller must still lead the clan the offer came from.
      const [myTeam] = await tx
        .select({ id: teamsTable.id })
        .from(teamsTable)
        .where(or(eq(teamsTable.presidentId, me), eq(teamsTable.coachId, me)))
        .limit(1);
      if (!myTeam || myTeam.id !== offer.teamId) {
        throw httpError(403, "You are no longer the President or Coach of that clan");
      }

      // Re-read the thread: the player's answer and any completed payment.
      const thread = await tx
        .select({ text: agentMessagesTable.text })
        .from(agentMessagesTable)
        .where(eq(agentMessagesTable.conversationId, conv.id));

      let accepted: WgInviteResultPayload | null = null;
      let alreadyPaid = false;
      for (const row of thread) {
        const sys = parseSystemMessage(row.text);
        if (!sys) continue;
        if (sys.kind === "wg_invite_result" && sys.inviteId === offer.inviteId && sys.accepted) accepted = sys;
        if (sys.kind === "wg_transfer_paid" && sys.inviteId === offer.inviteId) alreadyPaid = true;
      }
      if (alreadyPaid) throw httpError(409, "This transfer has already been paid for");
      if (!accepted) throw httpError(409, "The player has not agreed to this offer yet");

      // Lock the money row (the buyer) and the player being signed.
      const lockedBuyer = await tx.execute(
        sql`SELECT id, coin_balance FROM players WHERE id = ${me} FOR UPDATE`,
      );
      const buyer = ((lockedBuyer as unknown as { rows: { id: number; coin_balance: number }[] }).rows ?? [])[0];
      if (!buyer) throw httpError(404, "Player not found");

      const lockedTarget = await tx.execute(
        sql`SELECT id, username, display_name, team_id, coin_balance, market_value FROM players WHERE id = ${conv.agentPlayerId} FOR UPDATE`,
      );
      const player = ((lockedTarget as unknown as { rows: LockedPlayerRow[] }).rows ?? [])[0];
      if (!player) throw httpError(404, "Player not found");

      if (player.team_id === offer.teamId) throw httpError(409, "That player is already in your clan");
      // The offer only stays valid while the player is where he was when he
      // agreed: still a free agent, or still at the clan he agreed to leave.
      if (player.team_id != null && accepted.fromTeamId !== player.team_id) {
        throw httpError(409, "This offer is out of date — the player has changed clans. Send a new offer.");
      }

      const balance = Number(buyer.coin_balance ?? 0);
      if (balance < offer.feeCoins) {
        throw httpError(
          402,
          `Not enough WG Coins: this signing costs ${offer.marketValueM}M and your balance is ${Math.floor(balance / COINS_PER_MARKET_VALUE_M)}M. Buy WG Coins to complete it.`,
        );
      }

      // A player leaving another clan: release the seat he held there, so the
      // clan he leaves never keeps a Captain/Coach pointing at someone who left.
      let fromTeamName: string | null = null;
      if (player.team_id != null) {
        const [previous] = await tx.select().from(teamsTable).where(eq(teamsTable.id, player.team_id));
        if (previous) {
          fromTeamName = previous.name;
          if (previous.presidentId === player.id) {
            throw httpError(403, "That player is a clan President — they must transfer ownership before they can be signed.");
          }
          if (previous.coachId === player.id || previous.captainId === player.id) {
            await tx
              .update(teamsTable)
              .set({
                coachId: previous.coachId === player.id ? null : previous.coachId,
                captainId: previous.captainId === player.id ? null : previous.captainId,
              })
              .where(eq(teamsTable.id, previous.id));
          }
        }
      }

      // Charge the fee, sign the contract and move the player — atomically.
      await tx
        .update(playersTable)
        .set({ coinBalance: sql`${playersTable.coinBalance} - ${offer.feeCoins}` })
        .where(eq(playersTable.id, me));
      await tx.insert(coinSpendsTable).values({ playerId: me, item: "player-transfer", coins: offer.feeCoins });

      const [currentSeason] = await tx
        .select({ id: seasonsTable.id })
        .from(seasonsTable)
        .where(eq(seasonsTable.isCurrent, true))
        .limit(1);

      await tx
        .update(playersTable)
        .set({
          teamId: offer.teamId,
          isFreeAgent: false,
          contractSeasons: offer.seasons,
          contractSeasonsLeft: offer.seasons,
          contractSignedSeasonId: currentSeason?.id ?? null,
        })
        .where(eq(playersTable.id, player.id));

      await tx
        .insert(playerTransfersTable)
        .values({ playerId: player.id, fromTeamId: player.team_id, toTeamId: offer.teamId });

      const [buyerRow] = await tx
        .select({
          displayName: playersTable.displayName,
          username: playersTable.username,
          coinBalance: playersTable.coinBalance,
        })
        .from(playersTable)
        .where(eq(playersTable.id, me));

      const record: WgTransferPaidPayload = {
        kind: "wg_transfer_paid",
        inviteId: offer.inviteId,
        teamId: offer.teamId,
        teamName: offer.teamName,
        playerId: player.id,
        playerName: player.display_name ?? player.username,
        buyerName: buyerRow?.displayName ?? buyerRow?.username ?? me.toString(),
        feeCoins: offer.feeCoins,
        fromTeamName,
      };

      const [message] = await tx
        .insert(agentMessagesTable)
        .values({ conversationId: conv.id, senderPlayerId: me, senderRole: "system", text: JSON.stringify(record) })
        .returning();

      const now = new Date();
      await tx
        .update(agentConversationsTable)
        .set({ updatedAt: now, playerLastSeenAt: now, unreadByAgent: sql`${agentConversationsTable.unreadByAgent} + 1` })
        .where(eq(agentConversationsTable.id, conv.id));

      return {
        message,
        record,
        balance: Number(buyerRow?.coinBalance ?? balance - offer.feeCoins),
      };
    });

    res.status(201).json({ ...messageJson(paid.message), sys: paid.record, balance: paid.balance });
  } catch (err) {
    const status = (err as { status?: number }).status ?? 500;
    if (status === 500) console.error("[agent-chat] transfer payment failed", err);
    res.status(status).json({ error: err instanceof Error ? err.message : "Could not pay for this signing" });
  }
});

export default router;