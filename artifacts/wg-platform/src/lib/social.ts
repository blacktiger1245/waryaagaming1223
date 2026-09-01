import { apiFetch } from "./api";

// ── Social: follows, DMs, team chat ───────────────────────────────────────────
export type SocialUser = {
  id: number;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  verified?: boolean;
};

export type FollowStatus = {
  following: boolean;
  followerCount: number;
  followingCount: number;
};

export type InboxMessage = {
  id: number;
  partnerId: number;
  partner: SocialUser;
  content: string;
  readAt: string | null;
  createdAt: string | null;
};

export type SentMessage = {
  id: number;
  partnerId: number;
  partner: SocialUser;
  content: string;
  createdAt: string | null;
};

export type ThreadMessage = {
  id: number;
  senderId: number;
  recipientId: number;
  content: string;
  createdAt: string | null;
  mine: boolean;
};

export type TeamChatMessage = {
  id: number;
  senderId: number;
  content: string;
  createdAt: string | null;
  mine: boolean;
  sender: SocialUser;
};

export const social = {
  followStatus: (playerId: number) =>
    apiFetch<FollowStatus>(`/api/players/${playerId}/follow`),
  follow: (playerId: number) =>
    apiFetch<FollowStatus>(`/api/players/${playerId}/follow`, { method: "POST" }),
  unfollow: (playerId: number) =>
    apiFetch<FollowStatus>(`/api/players/${playerId}/follow`, { method: "DELETE" }),
  inbox: () => apiFetch<InboxMessage[]>("/api/messages/inbox"),
  sent: () => apiFetch<SentMessage[]>("/api/messages/sent"),
  thread: (playerId: number) =>
    apiFetch<ThreadMessage[]>(`/api/messages/thread/${playerId}`),
  sendMessage: (playerId: number, content: string) =>
    apiFetch<ThreadMessage>(`/api/messages/${playerId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    }),
  teamChat: (teamId: number) =>
    apiFetch<TeamChatMessage[]>(`/api/teams/${teamId}/chat`),
  sendTeamChat: (teamId: number, content: string) =>
    apiFetch<TeamChatMessage>(`/api/teams/${teamId}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    }),
};
