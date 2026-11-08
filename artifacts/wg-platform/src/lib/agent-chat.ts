import { apiUrl } from "./api";

export type AgentChatRole = "player" | "agent";

export interface AgentChatParticipant {
  id: number;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  country: string | null;
  online: boolean;
  /** Market Value in M coins — the price of signing this player. */
  marketValue?: number;
}

export interface AgentChatLastMessage {
  id: number;
  text: string;
  senderRole: AgentChatRole;
  senderPlayerId: number;
  sentAt: string;
  readAt: string | null;
}

export interface AgentChatConversation {
  id: number;
  meRole: AgentChatRole;
  counterpart: AgentChatParticipant | null;
  agentPlayer: AgentChatParticipant | null;
  player: AgentChatParticipant | null;
  unread: number;
  unreadByAgent: number;
  unreadByPlayer: number;
  lastMessage: AgentChatLastMessage | null;
  updatedAt: string;
}

export interface AgentChatMessage {
  id: number;
  senderRole: AgentChatRole;
  text: string;
  sentAt: string;
  readAt: string | null;
}

export interface AgentChatThread {
  conversationId: number;
  meRole: AgentChatRole;
  participant: AgentChatParticipant | null;
  messages: AgentChatMessage[];
}

// ── Team-invite (President / Coach) feature ─────────────────────────────────
export interface AgentChannelContext {
  isLeader: boolean;
  role: "president" | "coach" | null;
  teamId: number | null;
  teamName: string | null;
  /** The caller's WG Coin balance — pays a player's Market Value on a signing. */
  coinBalance: number;
}

export interface WgInvitePayload {
  kind: "wg_invite";
  inviteId: number;
  teamId: number;
  teamName: string;
  presidentName: string;
  /** Contract length in seasons offered with this invitation (1 or 2). */
  seasons: number;
  /** Market Value of the player, in M coins. */
  marketValueM: number;
  /** Signing fee in WG Coins the clan pays (0 = free signing). */
  feeCoins: number;
}

export interface WgInviteResultPayload {
  kind: "wg_invite_result";
  inviteId: number;
  accepted: boolean;
  teamName: string;
  agentName: string;
  /** Signing fee that still has to be paid (0 = free signing). */
  feeCoins: number;
  /** Accepted, but the clan has not paid yet — the player is not signed. */
  awaitingPayment: boolean;
  fromTeamId: number | null;
}

/** Card written once a signing fee has been paid and the player has joined. */
export interface WgTransferPaidPayload {
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

export type WgSystemPayload = WgInvitePayload | WgInviteResultPayload | WgTransferPaidPayload;

/** WG Coins per one unit of Market Value (which is quoted in millions). */
export const COINS_PER_MARKET_VALUE_M = 1_000_000;

/** Format a WG Coin amount the way fees are quoted, e.g. 120000000 -> "120M". */
export function coinsInMillions(coins: number): string {
  const millions = Math.round((Number(coins || 0) / COINS_PER_MARKET_VALUE_M) * 100) / 100;
  return `${millions}M`;
}

/**
 * Detect team-invite / invite-result / paid-transfer system messages. Plain chat
 * messages (and any other text) return null.
 */
export function parseWgSystemMessage(text: string): WgSystemPayload | null {
  if (typeof text !== "string" || !text.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(text) as WgSystemPayload;
    if (!parsed || typeof parsed.kind !== "string") return null;
    if (parsed.kind === "wg_invite") {
      // Offers written before paid signings existed carry no fee fields.
      return {
        ...parsed,
        marketValueM: Number(parsed.marketValueM ?? 0),
        feeCoins: Number(parsed.feeCoins ?? 0),
      };
    }
    if (parsed.kind === "wg_invite_result") {
      return {
        ...parsed,
        feeCoins: Number(parsed.feeCoins ?? 0),
        awaitingPayment: Boolean(parsed.awaitingPayment),
        fromTeamId: parsed.fromTeamId ?? null,
      };
    }
    if (parsed.kind === "wg_transfer_paid") {
      return { ...parsed, feeCoins: Number(parsed.feeCoins ?? 0) };
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function isWgInviteSystemMessage(text: string): boolean {
  return parseWgSystemMessage(text)?.kind === "wg_invite";
}

/** Current user's leadership context — drives the chat gate + invite button. */
export function fetchAgentChannelContext(): Promise<AgentChannelContext> {
  return chatRequest<AgentChannelContext>("/api/agent-chat/me");
}

/** Post a team invitation as the player side (President/Coach). */
export function sendTeamInvite(conversationId: number, seasons: 1 | 2): Promise<{ id: number; sys: WgInvitePayload }> {
  return chatRequest(`/api/agent-chat/conversations/${conversationId}/invite`, {
    method: "POST",
    body: JSON.stringify({ seasons }),
  });
}

/** Accept or reject a team invitation as the invited player (agent side). */
export function respondToInvite(
  conversationId: number,
  inviteId: number,
  decision: "accept" | "reject",
): Promise<{ id: number; sys: WgInviteResultPayload }> {
  return chatRequest(`/api/agent-chat/invites/${inviteId}/respond`, {
    method: "POST",
    body: JSON.stringify({ decision }),
  });
}

/**
 * Pay the signing fee of an offer the player has already accepted (buyer side).
 * The server charges the player's Market Value in WG Coins and signs the player;
 * this only needs the invitation message id.
 */
export function payTransferFee(
  inviteId: number,
): Promise<{ id: number; sys: WgTransferPaidPayload; balance: number }> {
  return chatRequest(`/api/agent-chat/invites/${inviteId}/pay`, { method: "POST" });
}

async function chatRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const options: RequestInit = {
    credentials: "include",
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    ...init,
  };
  const res = await fetch(apiUrl(path), options);
  if (res.status === 401) throw new Error("Login required");
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error ?? "Request failed");
  }
  return data as T;
}

/** Inbox: every conversation where the current user is the agent OR the player. */
export function fetchAgentInbox(): Promise<{ conversations: AgentChatConversation[]; totalUnread: number }> {
  return chatRequest("/api/agent-chat/inbox");
}

/** Total unread count for the current user (either side) — for the header badge. */
export function fetchUnreadCount(): Promise<{ totalUnread: number }> {
  return chatRequest("/api/agent-chat/unread-count");
}

/** Get or create the conversation between the current user and an agent. */
export function openAgentConversation(agentPlayerId: number): Promise<AgentChatConversation> {
  return chatRequest<AgentChatConversation>("/api/agent-chat/conversations", {
    method: "POST",
    body: JSON.stringify({ agentPlayerId }),
  });
}

/** Full message thread for a conversation (works for both sides). */
export function fetchConversationMessages(conversationId: number): Promise<AgentChatThread> {
  return chatRequest<AgentChatThread>(`/api/agent-chat/conversations/${conversationId}/messages`);
}

/** Send a message as the current user in the given conversation. */
export function sendConversationMessage(conversationId: number, text: string): Promise<AgentChatMessage> {
  return chatRequest<AgentChatMessage>(`/api/agent-chat/conversations/${conversationId}/messages`, {
    method: "POST",
    body: JSON.stringify({ text }),
  });
}