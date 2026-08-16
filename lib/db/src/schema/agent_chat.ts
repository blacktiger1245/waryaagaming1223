import { pgTable, serial, integer, text, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";

/**
 * One conversation between a Transfer Market player (usually a coach/scout)
 * and the agent of a listed player. The "agent" side is represented by the
 * listed player's own account (players self-represent on the marketplace).
 */
export const agentConversationsTable = pgTable(
  "agent_conversations",
  {
    id: serial("id").primaryKey(),
    // The listed free-agent player whose "agent" manages this conversation.
    agentPlayerId: integer("agent_player_id").notNull(),
    // The logged-in player (coach/scout/buyer) who started the chat.
    playerId: integer("player_id").notNull(),
    // Unread counters, one per side (agent sees unreadByAgent, player sees unreadByPlayer).
    unreadByAgent: integer("unread_by_agent").notNull().default(0),
    unreadByPlayer: integer("unread_by_player").notNull().default(0),
    // Last activity timestamps per side, used for the online indicator.
    playerLastSeenAt: timestamp("player_last_seen_at"),
    agentLastSeenAt: timestamp("agent_last_seen_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("agent_conversations_pair_unique").on(
      table.agentPlayerId,
      table.playerId,
    ),
  ],
);

export const agentMessagesTable = pgTable(
  "agent_messages",
  {
    id: serial("id").primaryKey(),
    conversationId: integer("conversation_id").notNull(),
    senderPlayerId: integer("sender_player_id").notNull(),
    // "player" = the buyer side, "agent" = the listed player's agent side.
    senderRole: text("sender_role").notNull(),
    text: text("text").notNull(),
    // Set once the recipient has opened the conversation (read receipt).
    readAt: timestamp("read_at"),
    sentAt: timestamp("sent_at").notNull().defaultNow(),
  },
  (table) => [
    index("agent_messages_conversation_idx").on(table.conversationId),
  ],
);

export type AgentConversation = typeof agentConversationsTable.$inferSelect;
export type AgentMessage = typeof agentMessagesTable.$inferSelect;