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
  agentPlayer: AgentChatParticipant | null;
  player: AgentChatParticipant | null;
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

/** Agent inbox: every conversation where the current user is the agent. */
export function fetchAgentInbox(): Promise<{ conversations: AgentChatConversation[]; totalUnread: number }> {
  return chatRequest("/api/agent-chat/inbox");
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