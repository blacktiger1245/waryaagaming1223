import {
  pgTable,
  serial,
  integer,
  text,
  timestamp,
  boolean,
  unique,
  index,
} from "drizzle-orm/pg-core";

/**
 * WG Support / Live Chat system tables.
 *
 * - support_tickets: one ticket = one support conversation. A user creates a
 *   ticket, an admin accepts (assigns themselves), they chat, then either side
 *   (or an owner) closes it. Ratings are attached at/after closing.
 * - support_ticket_messages: messages + optional image attachments per ticket.
 * - support_ticket_ratings: a single user rating per ticket for the assigned
 *   admin (unique on ticketId → each ticket can be rated at most once).
 * - admin_availability: manual online/offline switch + last heartbeat per admin.
 * - admin_notifications: in-app inbox notifications for admins (new ticket,
 *   incoming message, reassignment, close).
 */
export const supportTicketsTable = pgTable(
  "support_tickets",
  {
    id: serial("id").primaryKey(),
    // The player who created the ticket.
    userId: integer("user_id").notNull(),
    subject: text("subject").notNull(),
    category: text("category").notNull().default("general"),
    // "waiting" (awaiting an admin) | "active" (accepted, in progress) | "closed".
    status: text("status").notNull().default("waiting"),
    // Admin who accepted / is assigned to this ticket.
    assignedAdminId: integer("assigned_admin_id"),
    // Who closed the ticket (admin id or the user id).
    closedById: integer("closed_by_id"),
    closedAt: timestamp("closed_at"),
    // Unread counters, one per side (user vs admin).
    userUnread: integer("user_unread").notNull().default(0),
    adminUnread: integer("admin_unread").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("support_tickets_user_idx").on(t.userId),
    index("support_tickets_assigned_idx").on(t.assignedAdminId),
    index("support_tickets_status_idx").on(t.status),
  ],
);

export const supportTicketMessagesTable = pgTable(
  "support_ticket_messages",
  {
    id: serial("id").primaryKey(),
    ticketId: integer("ticket_id").notNull(),
    senderId: integer("sender_id").notNull(),
    // "user" (ticket owner) | "admin" | "owner".
    senderRole: text("sender_role").notNull(),
    text: text("text").notNull(),
    // Optional attachment (object-storage /objects/<key> path).
    attachmentPath: text("attachment_path"),
    attachmentType: text("attachment_type"),
    attachmentName: text("attachment_name"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("support_messages_ticket_idx").on(t.ticketId)],
);

export const supportTicketRatingsTable = pgTable(
  "support_ticket_ratings",
  {
    id: serial("id").primaryKey(),
    ticketId: integer("ticket_id").notNull(),
    userId: integer("user_id").notNull(),
    // The admin this ticket was assigned to (never changed after rating).
    adminId: integer("admin_id").notNull(),
    rating: integer("rating").notNull(),
    feedback: text("feedback"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    unique("support_ratings_ticket_unique").on(t.ticketId),
    index("support_ratings_admin_idx").on(t.adminId),
  ],
);

export const adminAvailabilityTable = pgTable(
  "admin_availability",
  {
    id: serial("id").primaryKey(),
    adminId: integer("admin_id").notNull(),
    online: boolean("online").notNull().default(false),
    lastActiveAt: timestamp("last_active_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [unique("admin_availability_admin_unique").on(t.adminId)],
);

export const adminNotificationsTable = pgTable(
  "admin_notifications",
  {
    id: serial("id").primaryKey(),
    adminId: integer("admin_id").notNull(),
    // The player the notification is about (e.g. the user who opened the ticket).
    userId: integer("user_id").notNull(),
    ticketId: integer("ticket_id").notNull(),
    // "new_ticket" | "message" | "reassigned" | "closed".
    type: text("type").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    read: boolean("read").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("admin_notifications_admin_idx").on(t.adminId),
    index("admin_notifications_read_idx").on(t.adminId, t.read),
  ],
);

export type SupportTicket = typeof supportTicketsTable.$inferSelect;
export type SupportTicketMessage = typeof supportTicketMessagesTable.$inferSelect;
export type SupportTicketRating = typeof supportTicketRatingsTable.$inferSelect;
export type AdminAvailability = typeof adminAvailabilityTable.$inferSelect;
export type AdminNotification = typeof adminNotificationsTable.$inferSelect;