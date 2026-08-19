import { Router, type Request, type Response } from "express";
import { db } from "@workspace/db";
import {
  playersTable,
  supportTicketsTable,
  supportTicketMessagesTable,
  supportTicketRatingsTable,
} from "@workspace/db";
import { eq, desc, inArray, sql } from "drizzle-orm";
import {
  toIso,
  MAX_SUBJECT,
  MAX_TEXT,
  MAX_FEEDBACK,
  listOnlineAdmins,
  notifyAdmins,
} from "../lib/support-helpers";

const router = Router();

const CATEGORIES = new Set(["general", "account", "tournament", "payment", "technical", "report"]);

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

function isAdminRole(role: string | undefined): boolean {
  return role === "admin" || role === "owner";
}

// ── GET /support/status ──────────────────────────────────────────────────────
router.get("/support/status", async (_req: Request, res: Response) => {
  const onlineAdmins = await listOnlineAdmins();
  res.json({ onlineAdmins: onlineAdmins.length, adminOnline: onlineAdmins.length > 0 });
});

// ── POST /support/tickets ────────────────────────────────────────────────────
router.post("/support/tickets", async (req: Request, res: Response) => {
  const me = req.session?.userId;
  if (!me) { res.status(401).json({ error: "Login required" }); return; }

  const body = (req.body ?? {}) as {
    subject?: unknown; category?: unknown; message?: unknown;
    attachmentPath?: unknown; attachmentType?: unknown; attachmentName?: unknown;
  };

  const subject = typeof body.subject === "string" ? body.subject.trim() : "";
  const category = typeof body.category === "string" ? body.category : "general";
  const message = typeof body.message === "string" ? body.message.trim() : "";
  const attachmentPath = typeof body.attachmentPath === "string" ? body.attachmentPath : null;
  const attachmentType = typeof body.attachmentType === "string" ? body.attachmentType : null;
  const attachmentName = typeof body.attachmentName === "string" ? body.attachmentName : null;

  if (!subject) { res.status(400).json({ error: "Subject is required" }); return; }
  if (subject.length > MAX_SUBJECT) { res.status(400).json({ error: "Subject too long" }); return; }
  if (!message && !attachmentPath) { res.status(400).json({ error: "Message is required" }); return; }
  if (message.length > MAX_TEXT) { res.status(400).json({ error: "Message too long" }); return; }
  if (!CATEGORIES.has(category)) { res.status(400).json({ error: "Invalid category" }); return; }

  const [ticket] = await db
    .insert(supportTicketsTable)
    .values({ userId: me, subject, category, status: "waiting" })
    .returning();

  await db.insert(supportTicketMessagesTable).values({
    ticketId: ticket.id,
    senderId: me,
    senderRole: "user",
    text: message || "—",
    attachmentPath,
    attachmentType,
    attachmentName,
  });

  const onlineAdmins = await listOnlineAdmins();
  const [user] = await db
    .select({ username: playersTable.username, displayName: playersTable.displayName })
    .from(playersTable)
    .where(eq(playersTable.id, me));
  const userName = user?.displayName ?? user?.username ?? "A user";
  await notifyAdmins({
    adminIds: onlineAdmins.map((a) => a.id),
    userId: me,
    ticketId: ticket.id,
    type: "new_ticket",
    title: "🔔 New Support Ticket",
    body: `${userName}: ${subject}`,
  });

  res.status(201).json(ticketJson(ticket));
});

// ── GET /support/tickets ─────────────────────────────────────────────────────
router.get("/support/tickets", async (req: Request, res: Response) => {
  const me = req.session?.userId;
  if (!me) { res.status(401).json({ error: "Login required" }); return; }

  const tickets = await db
    .select()
    .from(supportTicketsTable)
    .where(eq(supportTicketsTable.userId, me))
    .orderBy(desc(supportTicketsTable.updatedAt));

  if (tickets.length === 0) { res.json({ tickets: [], totalUnread: 0 }); return; }

  const adminIds = [...new Set(tickets.filter((t) => t.assignedAdminId).map((t) => t.assignedAdminId!))] as number[];
  const adminRows = adminIds.length
    ? await db
        .select({
          id: playersTable.id,
          username: playersTable.username,
          displayName: playersTable.displayName,
          avatarUrl: playersTable.avatarUrl,
          role: playersTable.role,
        })
        .from(playersTable)
        .where(inArray(playersTable.id, adminIds))
    : [];
  const adminMap = new Map(adminRows.map((a) => [a.id, a]));

  const messages = await db
    .select()
    .from(supportTicketMessagesTable)
    .where(inArray(supportTicketMessagesTable.ticketId, tickets.map((t) => t.id)))
    .orderBy(desc(supportTicketMessagesTable.createdAt));
  const lastByTicket = new Map<number, typeof supportTicketMessagesTable.$inferSelect>();
  for (const m of messages) {
    if (!lastByTicket.has(m.ticketId)) lastByTicket.set(m.ticketId, m);
  }

  const totalUnread = tickets.reduce((s, t) => s + t.userUnread, 0);

  res.json({
    totalUnread,
    tickets: tickets.map((t) => {
      const admin = t.assignedAdminId ? (adminMap.get(t.assignedAdminId) ?? null) : null;
      const last = lastByTicket.get(t.id) ?? null;
      return {
        ...ticketJson(t),
        assignedAdmin: admin
          ? { id: admin.id, username: admin.username, displayName: admin.displayName, avatarUrl: admin.avatarUrl, role: admin.role }
          : null,
        lastMessage: last
          ? { text: last.text, senderRole: last.senderRole, createdAt: toIso(last.createdAt), hasAttachment: !!last.attachmentPath }
          : null,
      };
    }),
  });
});

// ── GET /support/tickets/:id ─────────────────────────────────────────────────
router.get("/support/tickets/:id", async (req: Request, res: Response) => {
  const me = req.session?.userId;
  if (!me) { res.status(401).json({ error: "Login required" }); return; }

  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Invalid ticket id" }); return; }

  const [ticket] = await db.select().from(supportTicketsTable).where(eq(supportTicketsTable.id, id));
  if (!ticket) { res.status(404).json({ error: "Ticket not found" }); return; }

  const adminViewer = isAdminRole(req.session?.role);
  if (ticket.userId !== me && !adminViewer) { res.status(403).json({ error: "Forbidden" }); return; }

  const messages = await db
    .select()
    .from(supportTicketMessagesTable)
    .where(eq(supportTicketMessagesTable.ticketId, id))
    .orderBy(desc(supportTicketMessagesTable.createdAt));

  const [userRow] = await db
    .select({ username: playersTable.username, displayName: playersTable.displayName, avatarUrl: playersTable.avatarUrl })
    .from(playersTable)
    .where(eq(playersTable.id, ticket.userId));

  let adminRow: { username: string; displayName: string | null; avatarUrl: string | null; role: string } | null = null;
  if (ticket.assignedAdminId) {
    const rows = await db
      .select({ username: playersTable.username, displayName: playersTable.displayName, avatarUrl: playersTable.avatarUrl, role: playersTable.role })
      .from(playersTable)
      .where(eq(playersTable.id, ticket.assignedAdminId));
    adminRow = rows[0] ?? null;
  }

  res.json({
    ...ticketJson(ticket),
    user: userRow ? { username: userRow.username, displayName: userRow.displayName, avatarUrl: userRow.avatarUrl } : null,
    assignedAdmin: adminRow,
    messages: messages.map(messageJson),
  });
});

// ── POST /support/tickets/:id/messages ───────────────────────────────────────
// The ticket owner sends a message (text and/or image attachment). Unread
// count for the admin side is bumped. Security is enforced server-side: only
// the ticket owner may post through this user-facing route.
router.post("/support/tickets/:id/messages", async (req: Request, res: Response) => {
  const me = req.session?.userId;
  if (!me) { res.status(401).json({ error: "Login required" }); return; }

  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Invalid ticket id" }); return; }
  const [ticket] = await db.select().from(supportTicketsTable).where(eq(supportTicketsTable.id, id));
  if (!ticket) { res.status(404).json({ error: "Ticket not found" }); return; }
  if (ticket.userId !== me) { res.status(403).json({ error: "Forbidden" }); return; }
  if (ticket.status === "closed") { res.status(400).json({ error: "This ticket is closed" }); return; }

  const body = (req.body ?? {}) as {
    text?: unknown;
    attachmentPath?: unknown;
    attachmentType?: unknown;
    attachmentName?: unknown;
  };
  const text = typeof body.text === "string" ? body.text.trim() : "";
  const attachmentPath = typeof body.attachmentPath === "string" ? body.attachmentPath : null;
  const attachmentType = typeof body.attachmentType === "string" ? body.attachmentType : null;
  const attachmentName = typeof body.attachmentName === "string" ? body.attachmentName : null;

  if (!text && !attachmentPath) { res.status(400).json({ error: "Message is required" }); return; }
  if (text.length > MAX_TEXT) { res.status(400).json({ error: "Message too long" }); return; }

  const [message] = await db
    .insert(supportTicketMessagesTable)
    .values({
      ticketId: ticket.id,
      senderId: me,
      senderRole: "user",
      text: text || "•  File",
      attachmentPath,
      attachmentType,
      attachmentName,
    })
    .returning();

  const now = new Date();
  await db
    .update(supportTicketsTable)
    .set({ updatedAt: now, adminUnread: sql`${supportTicketsTable.adminUnread} + 1` })
    .where(eq(supportTicketsTable.id, ticket.id));

  // Notify the assigned admin (unread badge) that the user replied.
  if (ticket.assignedAdminId) {
    await notifyAdmins({
      adminIds: [ticket.assignedAdminId],
      userId: me,
      ticketId: ticket.id,
      type: "message",
      title: "💬 New message",
      body: `Reply on "${ticket.subject}"`,
    });
  }

  res.status(201).json(messageJson(message));
});

// ── POST /support/tickets/:id/read ───────────────────────────────────────────
// The ticket owner clears their unread count. Never touches the admin side.
router.post("/support/tickets/:id/read", async (req: Request, res: Response) => {
  const me = req.session?.userId;
  if (!me) { res.status(401).json({ error: "Login required" }); return; }

  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Invalid ticket id" }); return; }
  const [ticket] = await db.select().from(supportTicketsTable).where(eq(supportTicketsTable.id, id));
  if (!ticket) { res.status(404).json({ error: "Ticket not found" }); return; }
  if (ticket.userId !== me) { res.status(403).json({ error: "Forbidden" }); return; }

  await db.update(supportTicketsTable).set({ userUnread: 0 }).where(eq(supportTicketsTable.id, id));
  res.json({ ok: true });
});

// ── POST /support/tickets/:id/close ──────────────────────────────────────────
// The ticket owner closes their own ticket.
router.post("/support/tickets/:id/close", async (req: Request, res: Response) => {
  const me = req.session?.userId;
  if (!me) { res.status(401).json({ error: "Login required" }); return; }

  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Invalid ticket id" }); return; }
  const [ticket] = await db.select().from(supportTicketsTable).where(eq(supportTicketsTable.id, id));
  if (!ticket) { res.status(404).json({ error: "Ticket not found" }); return; }
  if (ticket.userId !== me) { res.status(403).json({ error: "Forbidden" }); return; }
  if (ticket.status === "closed") { res.status(400).json({ error: "This ticket is already closed" }); return; }

  const now = new Date();
  await db
    .update(supportTicketsTable)
    .set({ status: "closed", closedAt: now, closedById: me, updatedAt: now })
    .where(eq(supportTicketsTable.id, id));

  res.json({ ok: true });
});

// ── POST /support/tickets/:id/rate ───────────────────────────────────────────
// The ticket owner rates the assigned admin once per closed ticket.
router.post("/support/tickets/:id/rate", async (req: Request, res: Response) => {
  const me = req.session?.userId;
  if (!me) { res.status(401).json({ error: "Login required" }); return; }

  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Invalid ticket id" }); return; }
  const [ticket] = await db.select().from(supportTicketsTable).where(eq(supportTicketsTable.id, id));
  if (!ticket) { res.status(404).json({ error: "Ticket not found" }); return; }
  if (ticket.userId !== me) { res.status(403).json({ error: "Forbidden" }); return; }
  if (ticket.status !== "closed") { res.status(400).json({ error: "Only closed tickets can be rated" }); return; }
  if (!ticket.assignedAdminId) { res.status(400).json({ error: "This ticket has no assigned admin" }); return; }

  const body = (req.body ?? {}) as { rating?: unknown; feedback?: unknown };
  const rating = Number(body.rating);
  const feedback = typeof body.feedback === "string" ? body.feedback.trim() : "";
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    res.status(400).json({ error: "Rating must be between 1 and 5" });
    return;
  }
  if (feedback.length > MAX_FEEDBACK) { res.status(400).json({ error: "Feedback is too long" }); return; }

  const [existing] = await db.select().from(supportTicketRatingsTable).where(eq(supportTicketRatingsTable.ticketId, id));
  if (existing) { res.status(409).json({ error: "This ticket has already been rated" }); return; }

  const [ratingRow] = await db
    .insert(supportTicketRatingsTable)
    .values({
      ticketId: id,
      userId: me,
      adminId: ticket.assignedAdminId,
      rating,
      feedback: feedback || null,
    })
    .returning();

  res.status(201).json({
    id: ratingRow.id,
    rating: ratingRow.rating,
    feedback: ratingRow.feedback,
    createdAt: toIso(ratingRow.createdAt),
  });
});

// ── GET /support/unread ──────────────────────────────────────────────────────
router.get("/support/unread", async (req: Request, res: Response) => {
  const me = req.session?.userId;
  if (!me) { res.status(401).json({ error: "Login required" }); return; }

  const tickets = await db.select().from(supportTicketsTable).where(eq(supportTicketsTable.userId, me));
  const totalUnread = tickets.reduce((s, t) => s + t.userUnread, 0);
  res.json({ totalUnread });
});

export default router;