import {
  db,
  playersTable,
  adminAvailabilityTable,
  adminNotificationsTable,
} from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";

export const MAX_SUBJECT = 120;
export const MAX_TEXT = 4000;
export const MAX_FEEDBACK = 1000;

export function toIso(value: unknown): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value as string).toISOString();
}

export interface OnlineAdmin {
  id: number;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  role: string;
}

/**
 * Admins that have opted in to support and are currently marked online.
 */
export async function listOnlineAdmins(): Promise<OnlineAdmin[]> {
  const rows = await db
    .select({
      id: playersTable.id,
      username: playersTable.username,
      displayName: playersTable.displayName,
      avatarUrl: playersTable.avatarUrl,
      role: playersTable.role,
    })
    .from(adminAvailabilityTable)
    .innerJoin(playersTable, eq(adminAvailabilityTable.adminId, playersTable.id))
    .where(
      and(
        eq(adminAvailabilityTable.online, true),
        inArray(playersTable.role, ["admin", "owner"]),
      ),
    );
  return rows;
}

export interface NotifyAdminsInput {
  adminIds: number[];
  userId: number;
  ticketId: number;
  type: string;
  title: string;
  body: string;
}

export async function notifyAdmins(input: NotifyAdminsInput): Promise<void> {
  if (!input.adminIds.length) return;
  const now = new Date();
  await db
    .insert(adminNotificationsTable)
    .values(
      input.adminIds.map((adminId) => ({
        adminId,
        userId: input.userId,
        ticketId: input.ticketId,
        type: input.type,
        title: input.title,
        body: input.body,
        createdAt: now,
      })),
    )
    .onConflictDoNothing();
}

export function isDiscordAdmin(req: import("express").Request): boolean {
  return (
    !!req.session?.userId &&
    (req.session?.role === "admin" || req.session?.role === "owner")
  );
}

export function isOwner(req: import("express").Request): boolean {
  return req.session?.role === "owner";
}