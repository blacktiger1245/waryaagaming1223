import { apiUrl } from "./api";

export const SUPPORT_CATEGORIES = ["general", "account", "tournament", "payment", "technical", "report"] as const;
export type SupportCategory = (typeof SUPPORT_CATEGORIES)[number];

export interface SupportTicket {
  id: number;
  userId: number;
  subject: string;
  category: string;
  status: "waiting" | "active" | "closed";
  assignedAdminId: number | null;
  userUnread: number;
  adminUnread: number;
  createdAt: string | null;
  updatedAt: string | null;
  closedAt: string | null;
  closedById: number | null;
}
export interface SupportMessage {
  id: number;
  ticketId: number;
  senderId: number;
  senderRole: "user" | "admin" | "owner";
  text: string;
  attachmentPath: string | null;
  attachmentType: string | null;
  attachmentName: string | null;
  createdAt: string | null;
}
export interface AdminBrief {
  id: number;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  role?: string;
  online?: boolean;
  lastActiveAt?: string | null;
  ticketsHandled?: number;
  ticketsClosed?: number;
  ratingCount?: number;
  avgRating?: number;
  breakdown?: Record<number, number>;
}
export interface AdminInboxTicket extends SupportTicket {
  user: AdminBrief | null;
  assignedAdmin: AdminBrief | null;
  lastMessage: { text: string; senderRole: string; createdAt: string | null; hasAttachment: boolean } | null;
  unread: number;
  isNewWaiting: boolean;
  isActive: boolean;
}
export interface AdminNotification {
  id: number;
  type: string;
  title: string;
  body: string;
  ticketId: number;
  read: boolean;
  createdAt: string | null;
  user: AdminBrief | null;
}
export interface AdminAnalytics {
  overview: {
    total: number; open: number; closed: number; waiting: number; active: number;
    totalRatings: number; overallAvg: number; avgResponseHours: number; avgResolutionHours: number;
  };
  admins: AdminBrief[];
}

async function req<T = any>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (typeof init?.body === "string" && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const res = await fetch(apiUrl(path), { credentials: "include", ...init, headers });
  const text = await res.text();
  let data: any = {};
  if (text) { try { data = JSON.parse(text); } catch { /* non-JSON body */ } }
  if (!res.ok) throw new Error(data?.error ?? `Request failed (${res.status})`);
  return data as T;
}

export interface Attachment { path: string; type: string; name: string; }

export async function uploadSupportAttachment(file: File): Promise<Attachment> {
  const res = await fetch(apiUrl("/api/storage/uploads/support-attachment/direct"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": file.type || "application/octet-stream" },
    body: file,
  });
  const text = await res.text();
  let data: any = {};
  if (text) { try { data = JSON.parse(text); } catch { /* ignore */ } }
  if (!res.ok || typeof data.objectPath !== "string") throw new Error(data?.error ?? "Upload failed");
  return { path: data.objectPath, type: data.attachmentType || file.type, name: file.name };
}

const attachmentPayload = (a?: Attachment | null) => ({
  attachmentPath: a?.path ?? undefined,
  attachmentType: a?.type ?? undefined,
  attachmentName: a?.name ?? undefined,
});

export interface MyTicket extends SupportTicket {
  assignedAdmin: AdminBrief | null;
  lastMessage: AdminInboxTicket["lastMessage"];
}

export const user = {
  status: () => req<{ onlineAdmins: number; adminOnline: boolean }>("/api/support/status"),
  create: (p: { subject: string; category: string; message: string; attachment?: Attachment | null }) =>
    req<SupportTicket>("/api/support/tickets", {
      method: "POST",
      body: JSON.stringify({ subject: p.subject, category: p.category, message: p.message, ...attachmentPayload(p.attachment) }),
    }),
  list: () => req<{ tickets: MyTicket[]; totalUnread: number }>("/api/support/tickets"),
  get: (id: number) => req<SupportTicket & { user: AdminBrief | null; assignedAdmin: AdminBrief | null; messages: SupportMessage[] }>(`/api/support/tickets/${id}`),
  send: (id: number, p: { text?: string; attachment?: Attachment | null }) =>
    req<SupportMessage>(`/api/support/tickets/${id}/messages`, {
      method: "POST",
      body: JSON.stringify({ text: p.text ?? "", ...attachmentPayload(p.attachment) }),
    }),
  read: (id: number) => req<{ ok: boolean }>(`/api/support/tickets/${id}/read`, { method: "POST" }),
  close: (id: number) => req<{ ok: boolean }>(`/api/support/tickets/${id}/close`, { method: "POST" }),
  rate: (id: number, rating: number, feedback: string) =>
    req<{ id: number; rating: number; feedback: string | null; createdAt: string | null }>(`/api/support/tickets/${id}/rate`, {
      method: "POST",
      body: JSON.stringify({ rating, feedback }),
    }),
  unread: () => req<{ totalUnread: number }>("/api/support/unread"),
};

export const supportAdmin = {
  availability: () => req<{ online: boolean; lastActiveAt: string | null }>("/api/admin/support/availability"),
  setAvailability: (online: boolean) => req<{ online: boolean }>("/api/admin/support/availability", { method: "POST", body: JSON.stringify({ online }) }),
  heartbeat: () => req<{ ok: boolean }>("/api/admin/support/heartbeat", { method: "POST" }),
  inbox: () => req<{ tickets: AdminInboxTicket[]; totalUnread: number }>("/api/admin/support/inbox"),
  get: (id: number) => req<SupportTicket & { user: AdminBrief | null; assignedAdmin: AdminBrief | null; canManage: boolean; isOwner: boolean; messages: SupportMessage[] }>(`/api/admin/support/tickets/${id}`),
  send: (id: number, p: { text?: string; attachment?: Attachment | null }) =>
    req<SupportMessage>(`/api/admin/support/tickets/${id}/messages`, {
      method: "POST",
      body: JSON.stringify({ text: p.text ?? "", ...attachmentPayload(p.attachment) }),
    }),
  accept: (id: number) => req<{ ok: boolean }>(`/api/admin/support/tickets/${id}/accept`, { method: "POST" }),
  close: (id: number) => req<{ ok: boolean }>(`/api/admin/support/tickets/${id}/close`, { method: "POST" }),
  reassign: (id: number, adminId: number) => req<{ ok: boolean }>(`/api/admin/support/tickets/${id}/reassign`, { method: "POST", body: JSON.stringify({ adminId }) }),
  markRead: (id: number) => req<{ ok: boolean }>(`/api/admin/support/tickets/${id}/read`, { method: "POST" }),
  history: () => req<{ tickets: (SupportTicket & { user: AdminBrief | null; lastMessage: AdminInboxTicket["lastMessage"] })[] }>("/api/admin/support/history"),
  unreadBadge: () => req<{ unread: number }>("/api/admin/support/unread-badge"),
  notifications: () => req<{ notifications: AdminNotification[]; totalUnread: number }>("/api/admin/support/notifications"),
  readAllNotifications: () => req<{ ok: boolean }>("/api/admin/support/notifications/read-all", { method: "POST" }),
  admins: () => req<{ admins: AdminBrief[] }>("/api/admin/support/admins"),
  setRole: (id: number, role: "admin" | "player") => req<{ ok: boolean }>(`/api/admin/support/admins/${id}/role`, { method: "PATCH", body: JSON.stringify({ role }) }),
  promoteOwner: (id: number) => req<{ ok: boolean }>(`/api/admin/support/admins/${id}/promote-owner`, { method: "POST" }),
  demoteOwner: (id: number) => req<{ ok: boolean }>(`/api/admin/support/admins/${id}/demote-owner`, { method: "POST" }),
  analytics: () => req<AdminAnalytics>("/api/admin/support/analytics"),
};