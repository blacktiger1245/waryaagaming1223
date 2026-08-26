import { apiUrl } from "./api";

export type AgentChatRole = "player" | "agent";

export interface AgentChatParticipant {
  id: number;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  country: string | null;
  online: boolean;
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
}

export interface WgInvitePayload {
  kind: "wg_invite";
  inviteId: number;
  teamId: number;
  teamName: string;
  presidentName: string;
}

export interface WgInviteResultPayload {
  kind: "wg_invite_result";
  inviteId: number;
  accepted: boolean;
  teamName: string;
  agentName: string;
}

export type WgSystemPayload = WgInvitePayload | WgInviteResultPayload;

/**
 * Detect team-invite / invite-result system messages. Plain chat messages (and
 * any other text) return null.
 */
export function parseWgSystemMessage(text: string): WgSystemPayload | null {
  if (typeof text !== "string" || !text.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(text) as WgSystemPayload;
    if (parsed && (parsed.kind === "wg_invite" || parsed.kind === "wg_invite_result")) {
      return parsed;
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
export function sendTeamInvite(conversationId: number): Promise<{ id: number; sys: WgInvitePayload }> {
  return chatRequest(`/api/agent-chat/conversations/${conversationId}/invite`, {
    method: "POST",
    body: JSON.stringify({}),
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