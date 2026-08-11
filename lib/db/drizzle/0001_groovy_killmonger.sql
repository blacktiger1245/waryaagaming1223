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
ALTER TABLE "players" ADD COLUMN "is_free_agent" boolean DEFAULT false NOT NULL;
ALTER TABLE "tournaments" ADD COLUMN "created_by" integer;
CREATE TABLE "tournament_admins" (
	"id" serial PRIMARY KEY NOT NULL,
	"tournament_id" integer NOT NULL,
	"player_id" integer NOT NULL,
	"role" text DEFAULT 'admin' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tournament_admins_tournament_player_unique" UNIQUE("tournament_id","player_id")
);