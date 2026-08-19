-- 0011_support_system.sql
-- WG Support / Live Chat system. Idempotent (IF NOT EXISTS) so it can be
-- applied repeatedly on any environment safely.

CREATE TABLE IF NOT EXISTS "support_tickets" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL,
  "subject" text NOT NULL,
  "category" text NOT NULL DEFAULT 'general',
  "status" text NOT NULL DEFAULT 'waiting',
  "assigned_admin_id" integer,
  "closed_by_id" integer,
  "closed_at" timestamp,
  "user_unread" integer NOT NULL DEFAULT 0,
  "admin_unread" integer NOT NULL DEFAULT 0,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "support_tickets_user_idx" ON "support_tickets" ("user_id");
CREATE INDEX IF NOT EXISTS "support_tickets_assigned_idx" ON "support_tickets" ("assigned_admin_id");
CREATE INDEX IF NOT EXISTS "support_tickets_status_idx" ON "support_tickets" ("status");

CREATE TABLE IF NOT EXISTS "support_ticket_messages" (
  "id" serial PRIMARY KEY NOT NULL,
  "ticket_id" integer NOT NULL,
  "sender_id" integer NOT NULL,
  "sender_role" text NOT NULL,
  "text" text NOT NULL,
  "attachment_path" text,
  "attachment_type" text,
  "attachment_name" text,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "support_messages_ticket_idx" ON "support_ticket_messages" ("ticket_id");

CREATE TABLE IF NOT EXISTS "support_ticket_ratings" (
  "id" serial PRIMARY KEY NOT NULL,
  "ticket_id" integer NOT NULL,
  "user_id" integer NOT NULL,
  "admin_id" integer NOT NULL,
  "rating" integer NOT NULL,
  "feedback" text,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "support_ratings_ticket_unique" ON "support_ticket_ratings" ("ticket_id");
CREATE INDEX IF NOT EXISTS "support_ratings_admin_idx" ON "support_ticket_ratings" ("admin_id");

CREATE TABLE IF NOT EXISTS "admin_availability" (
  "id" serial PRIMARY KEY NOT NULL,
  "admin_id" integer NOT NULL,
  "online" boolean NOT NULL DEFAULT false,
  "last_active_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "admin_availability_admin_unique" ON "admin_availability" ("admin_id");

CREATE TABLE IF NOT EXISTS "admin_notifications" (
  "id" serial PRIMARY KEY NOT NULL,
  "admin_id" integer NOT NULL,
  "user_id" integer NOT NULL,
  "ticket_id" integer NOT NULL,
  "type" text NOT NULL,
  "title" text NOT NULL,
  "body" text NOT NULL,
  "read" boolean NOT NULL DEFAULT false,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "admin_notifications_admin_idx" ON "admin_notifications" ("admin_id");
CREATE INDEX IF NOT EXISTS "admin_notifications_read_idx" ON "admin_notifications" ("admin_id", "read");