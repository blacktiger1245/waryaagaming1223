import { pgTable, serial, text, integer, timestamp, unique, index } from "drizzle-orm/pg-core";

// ── Player ↔ player follows ────────────────────────────────────────────────────
export const playerFollowsTable = pgTable(
  "player_follows",
  {
    id: serial("id").primaryKey(),
    followerId: integer("follower_id").notNull(), // the player who follows
    followingId: integer("following_id").notNull(), // the player being followed
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    unique("player_follows_pair_unique").on(t.followerId, t.followingId),
    index("player_follows_following_idx").on(t.followingId),
  ],
);

// ── Direct messages (player → player) ─────────────────────────────────────────
export const directMessagesTable = pgTable(
  "direct_messages",
  {
    id: serial("id").primaryKey(),
    senderId: integer("sender_id").notNull(),
    recipientId: integer("recipient_id").notNull(),
    content: text("content").notNull(),
    readAt: timestamp("read_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("direct_messages_sender_idx").on(t.senderId),
    index("direct_messages_recipient_idx").on(t.recipientId),
  ],
);

// ── Team chat (only team members can read/write) ──────────────────────────────
export const teamChatMessagesTable = pgTable(
  "team_chat_messages",
  {
    id: serial("id").primaryKey(),
    teamId: integer("team_id").notNull(),
    senderId: integer("sender_id").notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("team_chat_messages_team_idx").on(t.teamId)],
);

export type PlayerFollow = typeof playerFollowsTable.$inferSelect;
export type DirectMessage = typeof directMessagesTable.$inferSelect;
export type TeamChatMessage = typeof teamChatMessagesTable.$inferSelect;