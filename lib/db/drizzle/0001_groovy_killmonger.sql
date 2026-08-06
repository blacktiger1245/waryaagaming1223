CREATE TABLE "seasons" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"is_current" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "seasons_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "players" ADD COLUMN "banned_until" timestamp;--> statement-breakpoint
ALTER TABLE "players" ADD COLUMN "ban_reason" text;--> statement-breakpoint
ALTER TABLE "players" ADD COLUMN "banned_by" text;--> statement-breakpoint
ALTER TABLE "tournaments" ADD COLUMN "season_id" integer;