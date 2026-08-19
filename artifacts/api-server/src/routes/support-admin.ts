import { Router, type Request, type Response, type NextFunction } from "express";
import { db } from "@workspace/db";
import {
  playersTable,
  supportTicketsTable,
  supportTicketMessagesTable,
  supportTicketRatingsTable,
  adminAvailabilityTable,
  adminNotificationsTable,
} from "@workspace/db";
import { eq, and, desc, inArray, sql, isNull } from "drizzle-orm";
import {
  toIso,
  MAX_TEXT,
  notifyAdmins,
  listOnlineAdmins,
} from "../lib/support-helpers";

const router = Router();

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const isAdmin = !!req.session?.userId && (req.session?.role === "admin" || req.session?.role === "owner");
  if (!isAdmin) { res.status(401).json({ error: "Admin authentication required" }); return; }
  next();
}
function requireOwner(req: Request, res: Response, next: NextFunction) {
  if (req.session?.role !== "owner") { res.status(403).json({ error: "Owner permission required" }); return; }
  next();
}
function ticketJson(t: typeof supportTicketsTable.$inferSelect) {
  return {
    id: t.id,
    userId: t.userId,
    subject: t.subject,
    category: t.category,
    status: t.status,
    assignedAdminId: t.assignedAdminId,
    userUnread: t.userUnread,
    adminUnread: t.adminUnread,
    createdAt: toIso(t.createdAt),
    updatedAt: toIso(t.updatedAt),
    closedAt: toIso(t.closedAt),
    closedById: t.closedById,
  };
}

function messageJson(m: typeof supportTicketMessagesTable.$inferSelect) {
  return {
    id: m.id,
    ticketId: m.ticketId,
    senderId: m.senderId,
    senderRole: m.senderRole,
    text: m.text,
    attachmentPath: m.attachmentPath,
    attachmentType: m.attachmentType,
    attachmentName: m.attachmentName,
    createdAt: toIso(m.createdAt),
  };
}

// All admin/support routes are admin-gated.
router.use("/admin/support", requireAdmin);

// ── GET /admin/support/availability ──────────────────────────────────────────
// The current admin's manual online/offline availability status.
router.get("/admin/support/availability", async (req: Request, res: Response) => {
  const me = req.session!.userId!;
  const [row] = await db.select().from(adminAvailabilityTable).where(eq(adminAvailabilityTable.adminId, me));
  res.json({
    online: row?.online ?? false,
    lastActiveAt: toIso(row?.lastActiveAt),
  });
});

// ── POST /admin/support/availability ─────────────────────────────────────────
// Toggle the current admin's manual online/offline status.
router.post("/admin/support/availability", async (req: Request, res: Response) => {
  const me = req.session!.userId!;
  const body = (req.body ?? {}) as { online?: unknown };
  const online = body.online === true || body.online === "true";
  const now = new Date();
  await db
    .insert(adminAvailabilityTable)
    .values({ adminId: me, online, lastActiveAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: adminAvailabilityTable.adminId,
      set: { online, updatedAt: now, lastActiveAt: now },
    });
  res.json({ online });
});

// ── POST /admin/support/heartbeat ────────────────────────────────────────────
// Refresh the current admin's last activity timestamp (called on polling).
router.post("/admin/support/heartbeat", async (req: Request, res: Response) => {
  const me = req.session!.userId!;
  const now = new Date();
  await db
    .insert(adminAvailabilityTable)
    .values({ adminId: me, online: false, lastActiveAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: adminAvailabilityTable.adminId,
      set: { lastActiveAt: now, updatedAt: now },
    });
  res.json({ ok: true });
});

// ── GET /admin/support/inbox ─────────────────────────────────────────────────
// Admin inbox: every ticket with user + assigned admin info, latest message and
// the caller's unread count. Owners see everything; admins see all tickets so
// they can accept any that are still waiting.
router.get("/admin/support/inbox", async (req: Request, res: Response) => {
  const me = req.session!.userId!;

  const tickets = await db
    .select()
    .from(supportTicketsTable)
    .orderBy(desc(supportTicketsTable.updatedAt))
    .limit(300);

  if (tickets.length === 0) { res.json({ tickets: [], totalUnread: 0 }); return; }

  const userIds = [...new Set(tickets.map((t) => t.userId))];
  const adminIds = [...new Set(tickets.filter((t) => t.assignedAdminId).map((t) => t.assignedAdminId!))];

  const [userRows, adminRows, messages] = await Promise.all([
    db.select({ id: playersTable.id, username: playersTable.username, displayName: playersTable.displayName, avatarUrl: playersTable.avatarUrl })
      .from(playersTable).where(inArray(playersTable.id, userIds)),
    adminIds.length
      ? db.select({ id: playersTable.id, username: playersTable.username, displayName: playersTable.displayName, avatarUrl: playersTable.avatarUrl, role: playersTable.role })
          .from(playersTable).where(inArray(playersTable.id, adminIds))
      : Promise.resolve([] as Array<{ id: number; username: string; displayName: string | null; avatarUrl: string | null; role: string }>),
    db.select().from(supportTicketMessagesTable)
      .where(inArray(supportTicketMessagesTable.ticketId, tickets.map((t) => t.id)))
      .orderBy(desc(supportTicketMessagesTable.createdAt)),
  ]);

  const userMap = new Map(userRows.map((u) => [u.id, u]));
  const adminMap = new Map(adminRows.map((a) => [a.id, a]));
  const lastMap = new Map<number, typeof supportTicketMessagesTable.$inferSelect>();
  for (const m of messages) if (!lastMap.has(m.ticketId)) lastMap.set(m.ticketId, m);

  const enriched = tickets.map((t) => {
    const user = userMap.get(t.userId) ?? null;
    const admin = t.assignedAdminId ? (adminMap.get(t.assignedAdminId) ?? null) : null;
    const last = lastMap.get(t.id) ?? null;
    const isAssignedToMe = t.assignedAdminId === me;
    return {
      ...ticketJson(t),
      user: user ? { id: user.id, username: user.username, displayName: user.displayName, avatarUrl: user.avatarUrl } : null,
      assignedAdmin: admin ? { id: admin.id, username: admin.username, displayName: admin.displayName, avatarUrl: admin.avatarUrl, role: admin.role } : null,
      lastMessage: last ? { text: last.text, senderRole: last.senderRole, createdAt: toIso(last.createdAt), hasAttachment: !!last.attachmentPath } : null,
      // Unread shown to THIS admin.
      unread: isAssignedToMe ? t.adminUnread : 0,
      isNewWaiting: t.status === "waiting" && !t.assignedAdminId,
      isActive: t.status === "active" && !!t.assignedAdminId,
    };
  });

  const totalUnread = enriched.reduce((s, e) => s + e.unread, 0);
  res.json({ tickets: enriched, totalUnread });
});

// ── GET /admin/support/tickets/:id ───────────────────────────────────────────
router.get("/admin/support/tickets/:id", async (req: Request, res: Response) => {
  const me = req.session!.userId!;
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Invalid ticket id" }); return; }

  const [ticket] = await db.select().from(supportTicketsTable).where(eq(supportTicketsTable.id, id));
  if (!ticket) { res.status(404).json({ error: "Ticket not found" }); return; }

  const [messages, userRows] = await Promise.all([
    db.select().from(supportTicketMessagesTable).where(eq(supportTicketMessagesTable.ticketId, id)).orderBy(desc(supportTicketMessagesTable.createdAt)),
    db.select({ username: playersTable.username, displayName: playersTable.displayName, avatarUrl: playersTable.avatarUrl })
      .from(playersTable).where(eq(playersTable.id, ticket.userId)),
  ]);

  let adminRow: { id: number; username: string; displayName: string | null; avatarUrl: string | null; role: string } | null = null;
  if (ticket.assignedAdminId) {
    const rows = await db.select({ id: playersTable.id, username: playersTable.username, displayName: playersTable.displayName, avatarUrl: playersTable.avatarUrl, role: playersTable.role })
      .from(playersTable).where(eq(playersTable.id, ticket.assignedAdminId));
    adminRow = rows[0] ?? null;
  }

  res.json({
    ...ticketJson(ticket),
    user: userRows[0] ? { username: userRows[0].username, displayName: userRows[0].displayName, avatarUrl: userRows[0].avatarUrl } : null,
    assignedAdmin: adminRow,
    canManage: ticket.assignedAdminId === me || req.session?.role === "owner",
    isOwner: req.session?.role === "owner",
    messages: messages.map(messageJson),
  });
});

// ── POST /admin/support/tickets/:id/accept ───────────────────────────────────
// Accept a waiting ticket and become the assigned admin. The claim is atomic:
// only one admin can ever win the UPDATE, so two admins can't both claim the
// same ticket. After a successful claim, other online admins are told the
// ticket has been taken so they stop trying to accept it.
router.post("/admin/support/tickets/:id/accept", async (req: Request, res: Response) => {
  const me = req.session!.userId!;
  const role = req.session?.role;
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Invalid ticket id" }); return; }

  const [ticket] = await db
    .select({ id: supportTicketsTable.id, status: supportTicketsTable.status, assignedAdminId: supportTicketsTable.assignedAdminId, userId: supportTicketsTable.userId, subject: supportTicketsTable.subject })
    .from(supportTicketsTable)
    .where(eq(supportTicketsTable.id, id));
  if (!ticket) { res.status(404).json({ error: "Ticket not found" }); return; }
  if (ticket.status === "closed") { res.status(400).json({ error: "This ticket is closed" }); return; }

  const now = new Date();
  let updated: typeof supportTicketsTable.$inferSelect | undefined;

  if (role === "owner") {
    // Owners may take over any (non-closed) ticket.
    [updated] = await db
      .update(supportTicketsTable)
      .set({ assignedAdminId: me, status: "active", updatedAt: now, adminUnread: 0 })
      .where(eq(supportTicketsTable.id, id))
      .returning();
  } else {
    // A normal admin may only claim a ticket that is still unassigned (or their own).
    [updated] = await db
      .update(supportTicketsTable)
      .set({ assignedAdminId: me, status: "active", updatedAt: now, adminUnread: 0 })
      .where(and(eq(supportTicketsTable.id, id), isNull(supportTicketsTable.assignedAdminId)))
      .returning();
  }

  if (!updated) {
    res.status(409).json({ error: "This ticket has already been claimed by another admin" });
    return;
  }

  // Tell the other online admins a ticket is no longer available to claim.
  const online = await listOnlineAdmins();
  const others = online.filter((a) => a.id !== me).map((a) => a.id);
  await notifyAdmins({
    adminIds: others,
    userId: ticket.userId,
    ticketId: id,
    type: "claimed",
    title: "✅ Ticket claimed",
    body: `"${ticket.subject}" was accepted by another admin`,
  });

  res.json({ ok: true, assignedAdminId: me, status: "active" });
});

// ── POST /admin/support/tickets/:id/messages ─────────────────────────────────
// Only the assigned admin (or an owner) can reply after acceptance.
router.post("/admin/support/tickets/:id/messages", async (req: Request, res: Response) => {
  const me = req.session!.userId!;
  const role = req.session!.role!;
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Invalid ticket id" }); return; }

  const [ticket] = await db.select().from(supportTicketsTable).where(eq(supportTicketsTable.id, id));
  if (!ticket) { res.status(404).json({ error: "Ticket not found" }); return; }
  if (ticket.status === "closed") { res.status(400).json({ error: "This ticket is closed" }); return; }
  const canManage = ticket.assignedAdminId === me || role === "owner";
  if (!canManage) {
    res.status(403).json({ error: "Only the assigned admin can reply to this ticket" });
    return;
  }

  const body = (req.body ?? {}) as { text?: unknown; attachmentPath?: unknown; attachmentType?: unknown; attachmentName?: unknown };
  const text = typeof body.text === "string" ? body.text.trim() : "";
  const attachmentPath = typeof body.attachmentPath === "string" ? body.attachmentPath : null;
  const attachmentType = typeof body.attachmentType === "string" ? body.attachmentType : null;
  const attachmentName = typeof body.attachmentName === "string" ? body.attachmentName : null;

  if (!text && !attachmentPath) { res.status(400).json({ error: "Message is required" }); return; }
  if (text.length > MAX_TEXT) { res.status(400).json({ error: "Message too long" }); return; }

  const [message] = await db
    .insert(supportTicketMessagesTable)
    .values({
      ticketId: id,
      senderId: me,
      senderRole: role === "owner" ? "owner" : "admin",
      text: text || "•  File",
      attachmentPath,
      attachmentType,
      attachmentName,
    })
    .returning();

  const now = new Date();
  await db
    .update(supportTicketsTable)
    .set({ updatedAt: now, userUnread: sql`${supportTicketsTable.userUnread} + 1` })
    .where(eq(supportTicketsTable.id, id));

  res.status(201).json(messageJson(message));
});

// ── POST /admin/support/tickets/:id/read ─────────────────────────────────────
// Clear the admin unread count for this ticket (assigned admin or owner only).
router.post("/admin/support/tickets/:id/read", async (req: Request, res: Response) => {
  const me = req.session!.userId!;
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Invalid ticket id" }); return; }
  const [ticket] = await db.select().from(supportTicketsTable).where(eq(supportTicketsTable.id, id));
  if (!ticket) { res.status(404).json({ error: "Ticket not found" }); return; }
  if (ticket.assignedAdminId !== me && req.session?.role !== "owner") { res.status(403).json({ error: "Forbidden" }); return; }
  await db.update(supportTicketsTable).set({ adminUnread: 0 }).where(eq(supportTicketsTable.id, id));
  res.json({ ok: true });
});

// ── POST /admin/support/tickets/:id/close ────────────────────────────────────
// The assigned admin (or any owner) closes the ticket.
router.post("/admin/support/tickets/:id/close", async (req: Request, res: Response) => {
  const me = req.session!.userId!;
  const role = req.session!.role!;
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Invalid ticket id" }); return; }
  const [ticket] = await db.select().from(supportTicketsTable).where(eq(supportTicketsTable.id, id));
  if (!ticket) { res.status(404).json({ error: "Ticket not found" }); return; }
  if (ticket.assignedAdminId !== me && role !== "owner") { res.status(403).json({ error: "Only the assigned admin can close this ticket" }); return; }
  if (ticket.status === "closed") { res.status(400).json({ error: "This ticket is already closed" }); return; }

  const now = new Date();
  await db
    .update(supportTicketsTable)
    .set({ status: "closed", closedAt: now, closedById: me, updatedAt: now })
    .where(eq(supportTicketsTable.id, id));

  res.json({ ok: true });
});

// ── POST /admin/support/tickets/:id/reassign ─────────────────────────────────
// Owner only: hand the ticket to another admin.
router.post("/admin/support/tickets/:id/reassign", requireOwner, async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Invalid ticket id" }); return; }
  const body = (req.body ?? {}) as { adminId?: unknown };
  const adminId = Number(body.adminId);
  if (!Number.isInteger(adminId)) { res.status(400).json({ error: "Invalid admin id" }); return; }

  const [ticket] = await db.select().from(supportTicketsTable).where(eq(supportTicketsTable.id, id));
  if (!ticket) { res.status(404).json({ error: "Ticket not found" }); return; }
  if (ticket.status === "closed") { res.status(400).json({ error: "This ticket is closed" }); return; }

  const [admin] = await db
    .select({ id: playersTable.id })
    .from(playersTable)
    .where(and(eq(playersTable.id, adminId), inArray(playersTable.role, ["admin", "owner"])));
  if (!admin) { res.status(400).json({ error: "Target is not an admin" }); return; }

  const now = new Date();
  await db
    .update(supportTicketsTable)
    .set({ assignedAdminId: adminId, status: "active", updatedAt: now })
    .where(eq(supportTicketsTable.id, id));

  await notifyAdmins({
    adminIds: [adminId],
    userId: ticket.userId,
    ticketId: ticket.id,
    type: "reassigned",
    title: "↔️ Ticket reassigned to you",
    body: `Subject: "${ticket.subject}"`,
  });

  res.json({ ok: true });
});

// ── GET /admin/support/history ───────────────────────────────────────────────
// Tickets the caller handled (or, for owners, all support history).
router.get("/admin/support/history", async (req: Request, res: Response) => {
  const me = req.session!.userId!;
  const isOwner = req.session?.role === "owner";

  const tickets = isOwner
    ? await db.select().from(supportTicketsTable).orderBy(desc(supportTicketsTable.updatedAt)).limit(300)
    : await db.select().from(supportTicketsTable).where(eq(supportTicketsTable.assignedAdminId, me)).orderBy(desc(supportTicketsTable.updatedAt)).limit(300);

  if (tickets.length === 0) { res.json({ tickets: [] }); return; }

  const userIds = [...new Set(tickets.map((t) => t.userId))];
  const messages = await db.select().from(supportTicketMessagesTable)
    .where(inArray(supportTicketMessagesTable.ticketId, tickets.map((t) => t.id)))
    .orderBy(desc(supportTicketMessagesTable.createdAt));
  const [userRows] = await Promise.all([
    db.select({ id: playersTable.id, username: playersTable.username, displayName: playersTable.displayName, avatarUrl: playersTable.avatarUrl })
      .from(playersTable).where(inArray(playersTable.id, userIds)),
  ]);
  const userMap = new Map(userRows.map((u) => [u.id, u]));
  const lastMap = new Map<number, typeof supportTicketMessagesTable.$inferSelect>();
  for (const m of messages) if (!lastMap.has(m.ticketId)) lastMap.set(m.ticketId, m);

  res.json({
    tickets: tickets.map((t) => ({
      ...ticketJson(t),
      user: userMap.get(t.userId) ?? null,
      lastMessage: lastMap.get(t.id) ? { text: lastMap.get(t.id)!.text, senderRole: lastMap.get(t.id)!.senderRole, createdAt: toIso(lastMap.get(t.id)!.createdAt), hasAttachment: !!lastMap.get(t.id)!.attachmentPath } : null,
    })),
  });
});

// ── GET /admin/support/unread-badge ──────────────────────────────────────────
// Unread notifications + unread messages on tickets assigned to this admin.
router.get("/admin/support/unread-badge", async (req: Request, res: Response) => {
  const me = req.session!.userId!;
  const [notifRows, ticketRows] = await Promise.all([
    db.select({ id: adminNotificationsTable.id }).from(adminNotificationsTable)
      .where(and(eq(adminNotificationsTable.adminId, me), eq(adminNotificationsTable.read, false))),
    db.select({ adminUnread: supportTicketsTable.adminUnread }).from(supportTicketsTable)
      .where(eq(supportTicketsTable.assignedAdminId, me)),
  ]);
  const ticketUnread = ticketRows.reduce((s, t) => s + t.adminUnread, 0);
  res.json({ unread: notifRows.length + ticketUnread });
});

// ── GET /admin/support/notifications ─────────────────────────────────────────
// Recent in-app notifications for this admin.
router.get("/admin/support/notifications", async (req: Request, res: Response) => {
  const me = req.session!.userId!;
  const rows = await db.select().from(adminNotificationsTable)
    .where(eq(adminNotificationsTable.adminId, me))
    .orderBy(desc(adminNotificationsTable.createdAt))
    .limit(50);

  const userIds = [...new Set(rows.map((n) => n.userId))];
  const userRows = userIds.length
    ? await db.select({ id: playersTable.id, username: playersTable.username, displayName: playersTable.displayName, avatarUrl: playersTable.avatarUrl })
        .from(playersTable).where(inArray(playersTable.id, userIds))
    : [];
  const userMap = new Map(userRows.map((u) => [u.id, u]));

  res.json({
    totalUnread: rows.filter((n) => !n.read).length,
    notifications: rows.map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      body: n.body,
      ticketId: n.ticketId,
      read: n.read,
      createdAt: toIso(n.createdAt),
      user: userMap.get(n.userId) ?? null,
    })),
  });
});

// ── POST /admin/support/notifications/read-all ───────────────────────────────
router.post("/admin/support/notifications/read-all", async (req: Request, res: Response) => {
  const me = req.session!.userId!;
  await db.update(adminNotificationsTable).set({ read: true })
    .where(and(eq(adminNotificationsTable.adminId, me), eq(adminNotificationsTable.read, false)));
  res.json({ ok: true });
});

// ── Owner: Manage Admins ─────────────────────────────────────────────────────
// List every admin/owner with availability, tickets handled, and rating stats.
router.get("/admin/support/admins", requireOwner, async (_req: Request, res: Response) => {
  const admins = await db
    .select({ id: playersTable.id, username: playersTable.username, displayName: playersTable.displayName, avatarUrl: playersTable.avatarUrl, role: playersTable.role })
    .from(playersTable).where(inArray(playersTable.role, ["admin", "owner"]));

  const adminIds = admins.map((a) => a.id);
  const [availRows, tickets, ratings] = await Promise.all([
    adminIds.length ? db.select().from(adminAvailabilityTable).where(inArray(adminAvailabilityTable.adminId, adminIds)) : Promise.resolve([] as typeof adminAvailabilityTable.$inferSelect[]),
    adminIds.length ? db.select().from(supportTicketsTable).where(inArray(supportTicketsTable.assignedAdminId, adminIds)) : Promise.resolve([] as typeof supportTicketsTable.$inferSelect[]),
    adminIds.length ? db.select().from(supportTicketRatingsTable).where(inArray(supportTicketRatingsTable.adminId, adminIds)) : Promise.resolve([] as typeof supportTicketRatingsTable.$inferSelect[]),
  ]);

  const availMap = new Map(availRows.map((r) => [r.adminId, r]));

  res.json({
    admins: admins.map((a) => {
      const myTickets = tickets.filter((t) => t.assignedAdminId === a.id);
      const myRatings = ratings.filter((r) => r.adminId === a.id);
      const sum = myRatings.reduce((s, r) => s + r.rating, 0);
      const avail = availMap.get(a.id);
      return {
        id: a.id,
        username: a.username,
        displayName: a.displayName,
        avatarUrl: a.avatarUrl,
        role: a.role,
        online: avail?.online ?? false,
        lastActiveAt: toIso(avail?.lastActiveAt),
        ticketsHandled: myTickets.length,
        ticketsClosed: myTickets.filter((t) => t.status === "closed").length,
        ratingCount: myRatings.length,
        avgRating: myRatings.length ? Math.round((sum / myRatings.length) * 100) / 100 : 0,
        breakdown: (() => { const b: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }; for (const r of myRatings) b[r.rating] = (b[r.rating] ?? 0) + 1; return b; })(),
      };
    }),
  });
});

// PATCH /admin/support/admins/:id/role — owner can add/remove the admin role.
router.patch("/admin/support/admins/:id/role", requireOwner, async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Invalid admin id" }); return; }
  const body = (req.body ?? {}) as { role?: unknown };
  const role = body.role === "admin" ? "admin" : body.role === "player" ? "player" : null;
  if (!role) { res.status(400).json({ error: "role must be 'admin' or 'player'" }); return; }

  const [target] = await db.select({ id: playersTable.id, role: playersTable.role }).from(playersTable).where(eq(playersTable.id, id));
  if (!target) { res.status(404).json({ error: "User not found" }); return; }
  if (target.role === "owner") { res.status(400).json({ error: "Use promote/demote to manage owners" }); return; }

  await db.update(playersTable).set({ role }).where(eq(playersTable.id, id));
  res.json({ ok: true });
});

// POST /admin/support/admins/:id/promote-owner — owner promotes an admin to owner.
router.post("/admin/support/admins/:id/promote-owner", requireOwner, async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Invalid admin id" }); return; }
  const [target] = await db.select({ id: playersTable.id, role: playersTable.role }).from(playersTable).where(eq(playersTable.id, id));
  if (!target) { res.status(404).json({ error: "User not found" }); return; }
  if (target.role === "owner") { res.status(400).json({ error: "Already an owner" }); return; }
  await db.update(playersTable).set({ role: "owner" }).where(eq(playersTable.id, id));
  res.json({ ok: true });
});

// POST /admin/support/admins/:id/demote-owner — owner demotes an owner to admin.
router.post("/admin/support/admins/:id/demote-owner", requireOwner, async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Invalid admin id" }); return; }
  const [target] = await db.select({ id: playersTable.id, role: playersTable.role }).from(playersTable).where(eq(playersTable.id, id));
  if (!target) { res.status(404).json({ error: "User not found" }); return; }
  if (target.role !== "owner") { res.status(400).json({ error: "Not an owner" }); return; }
  if (target.id === req.session!.userId!) { res.status(400).json({ error: "You cannot demote yourself" }); return; }
  await db.update(playersTable).set({ role: "admin" }).where(eq(playersTable.id, id));
  res.json({ ok: true });
});

// ── Owner: Support Analytics & Overview ──────────────────────────────────────
// Owner only. Aggregate statistics computed from the real ticket/rating data.
router.get("/admin/support/analytics", requireOwner, async (_req: Request, res: Response) => {
  const [tickets, ratings, messages, admins] = await Promise.all([
    db.select().from(supportTicketsTable),
    db.select().from(supportTicketRatingsTable),
    db.select({ ticketId: supportTicketMessagesTable.ticketId, senderRole: supportTicketMessagesTable.senderRole, createdAt: supportTicketMessagesTable.createdAt }).from(supportTicketMessagesTable),
    db.select({ id: playersTable.id, username: playersTable.username, displayName: playersTable.displayName, avatarUrl: playersTable.avatarUrl, role: playersTable.role })
      .from(playersTable).where(inArray(playersTable.role, ["admin", "owner"])),
  ]);

  const total = tickets.length;
  const open = tickets.filter((t) => t.status !== "closed").length;
  const closed = tickets.filter((t) => t.status === "closed").length;
  const waiting = tickets.filter((t) => t.status === "waiting").length;
  const active = tickets.filter((t) => t.status === "active").length;

  // First admin activity per ticket (earliest unlike-message from admin/owner).
  const firstAdminAt = new Map<number, number>();
  for (const m of messages) {
    if (m.senderRole !== "user") {
      const t = new Date(m.createdAt).getTime();
      const existing = firstAdminAt.get(m.ticketId);
      if (!existing || t < existing) firstAdminAt.set(m.ticketId, t);
    }
  }

  const avgHours = (values: number[]) => values.length ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10 : 0;
  const responseTimes: number[] = [];
  const resolutionTimes: number[] = [];
  for (const t of tickets) {
    const created = new Date(t.createdAt).getTime();
    const first = firstAdminAt.get(t.id);
    if (first) responseTimes.push(Math.max(0, (first - created) / 3600000));
    if (t.closedAt) resolutionTimes.push(Math.max(0, (new Date(t.closedAt).getTime() - created) / 3600000));
  }
  const avgResponseHours = avgHours(responseTimes);
  const avgResolutionHours = avgHours(resolutionTimes);

  const overallAvg = ratings.length ? Math.round((ratings.reduce((s, r) => s + r.rating, 0) / ratings.length) * 100) / 100 : 0;

  const adminPerformance = admins.map((a) => {
    const myTickets = tickets.filter((t) => t.assignedAdminId === a.id);
    const myRatings = ratings.filter((r) => r.adminId === a.id);
    const breakdown: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const r of myRatings) breakdown[r.rating] = (breakdown[r.rating] ?? 0) + 1;
    return {
      id: a.id,
      username: a.username,
      displayName: a.displayName,
      avatarUrl: a.avatarUrl,
      role: a.role,
      ticketsHandled: myTickets.length,
      ticketsClosed: myTickets.filter((t) => t.status === "closed").length,
      ratingCount: myRatings.length,
      avgRating: myRatings.length ? Math.round((myRatings.reduce((s, r) => s + r.rating, 0) / myRatings.length) * 100) / 100 : 0,
      breakdown,
    };
  }).sort((a, b) => b.avgRating - a.avgRating || b.ratingCount - a.ratingCount);

  res.json({
    overview: { total, open, closed, waiting, active, totalRatings: ratings.length, overallAvg, avgResponseHours, avgResolutionHours },
    admins: adminPerformance,
  });
});

export default router;