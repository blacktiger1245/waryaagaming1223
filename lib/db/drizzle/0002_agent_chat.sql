CREATE TABLE IF NOT EXISTS "agent_conversations" (
  "id" serial PRIMARY KEY NOT NULL,
  "agent_player_id" integer NOT NULL,
  "player_id" integer NOT NULL,
  "unread_by_agent" integer DEFAULT 0 NOT NULL,
  "unread_by_player" integer DEFAULT 0 NOT NULL,
  "player_last_seen_at" timestamp,
  "agent_last_seen_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "agent_conversations_pair_unique" ON "agent_conversations" ("agent_player_id", "player_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "agent_messages" (
  "id" serial PRIMARY KEY NOT NULL,
  "conversation_id" integer NOT NULL,
  "sender_player_id" integer NOT NULL,
  "sender_role" text NOT NULL,
  "text" text NOT NULL,
  "read_at" timestamp,
  "sent_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_messages_conversation_idx" ON "agent_messages" ("conversation_id");