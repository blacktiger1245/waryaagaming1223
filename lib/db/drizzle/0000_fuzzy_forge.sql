CREATE TABLE "players" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"display_name" text,
	"avatar_url" text,
	"email" text,
	"team_id" integer,
	"rank" integer DEFAULT 9999 NOT NULL,
	"previous_rank" integer DEFAULT 0 NOT NULL,
	"tournament_wins" integer DEFAULT 0 NOT NULL,
	"win_rate" real DEFAULT 0 NOT NULL,
	"matches_played" integer DEFAULT 0 NOT NULL,
	"matches_won" integer DEFAULT 0 NOT NULL,
	"matches_lost" integer DEFAULT 0 NOT NULL,
	"loss_rate" real DEFAULT 0 NOT NULL,
	"points" real DEFAULT 0 NOT NULL,
	"country" text,
	"discord_id" text,
	"bio" text,
	"clean_sheets" integer DEFAULT 0 NOT NULL,
	"rating" integer DEFAULT 0 NOT NULL,
	"market_value" integer DEFAULT 0 NOT NULL,
	"goals_scored" integer DEFAULT 0 NOT NULL,
	"draws" integer DEFAULT 0 NOT NULL,
	"goals_conceded" integer DEFAULT 0 NOT NULL,
	"man_of_the_match" integer DEFAULT 0 NOT NULL,
	"yellow_cards" integer DEFAULT 0 NOT NULL,
	"red_cards" integer DEFAULT 0 NOT NULL,
	"gaming_device" text,
	"device_name" text,
	"konami_id" text,
	"blood_group" text,
	"profile_complete" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"badges" text[] DEFAULT '{}' NOT NULL,
	"role" text DEFAULT 'player' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "players_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "discord_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"player_id" integer NOT NULL,
	"access_token" text NOT NULL,
	"refresh_token" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"last_synced_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "discord_tokens_player_id_unique" UNIQUE("player_id")
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"tag" text,
	"logo_url" text,
	"captain_id" integer NOT NULL,
	"coach_id" integer,
	"wins" integer DEFAULT 0 NOT NULL,
	"losses" integer DEFAULT 0 NOT NULL,
	"points" integer DEFAULT 0 NOT NULL,
	"description" text,
	"achievements" text[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "teams_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "tournaments" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'upcoming' NOT NULL,
	"format" text DEFAULT 'single-elimination' NOT NULL,
	"game" text DEFAULT 'eFootball' NOT NULL,
	"max_participants" integer DEFAULT 16 NOT NULL,
	"current_participants" integer DEFAULT 0 NOT NULL,
	"prize_pool" text DEFAULT '$0' NOT NULL,
	"start_date" text NOT NULL,
	"end_date" text,
	"rules" text,
	"stream_url" text,
	"winner_id" integer,
	"winner_name" text,
	"logo_url" text,
	"hosted_by" text,
	"tournament_type" text DEFAULT 'solo' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tournament_participants" (
	"id" serial PRIMARY KEY NOT NULL,
	"tournament_id" integer NOT NULL,
	"type" text DEFAULT 'player' NOT NULL,
	"player_id" integer,
	"team_id" integer,
	"seed" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "matches" (
	"id" serial PRIMARY KEY NOT NULL,
	"tournament_id" integer NOT NULL,
	"round" integer DEFAULT 1 NOT NULL,
	"round_name" text,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"participant1_id" integer,
	"participant1_name" text,
	"participant1_score" integer,
	"participant2_id" integer,
	"participant2_name" text,
	"participant2_score" integer,
	"winner_id" integer,
	"winner_name" text,
	"scheduled_at" text,
	"stream_url" text,
	"man_of_the_match_id" integer,
	"man_of_the_match_name" text,
	"participant1_yellow_cards" integer DEFAULT 0 NOT NULL,
	"participant1_red_cards" integer DEFAULT 0 NOT NULL,
	"participant2_yellow_cards" integer DEFAULT 0 NOT NULL,
	"participant2_red_cards" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "match_player_games" (
	"id" serial PRIMARY KEY NOT NULL,
	"match_id" integer NOT NULL,
	"home_player_id" integer,
	"home_player_name" text,
	"away_player_id" integer,
	"away_player_name" text,
	"home_score" integer,
	"away_score" integer,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hall_of_fame" (
	"id" serial PRIMARY KEY NOT NULL,
	"player_id" integer NOT NULL,
	"achievement" text NOT NULL,
	"year" integer NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "news" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"category" text DEFAULT 'community' NOT NULL,
	"content" text NOT NULL,
	"excerpt" text,
	"image_url" text,
	"author_id" integer,
	"author_name" text,
	"team_id" integer,
	"is_featured" boolean DEFAULT false NOT NULL,
	"published_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "news_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "media" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"platform" text NOT NULL,
	"url" text NOT NULL,
	"embed_url" text NOT NULL,
	"thumbnail_url" text,
	"description" text,
	"published_at" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "community_post_comments" (
	"id" serial PRIMARY KEY NOT NULL,
	"post_id" integer NOT NULL,
	"author_id" integer NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "community_post_likes" (
	"id" serial PRIMARY KEY NOT NULL,
	"post_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "community_post_likes_post_user" UNIQUE("post_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "community_posts" (
	"id" serial PRIMARY KEY NOT NULL,
	"author_id" integer NOT NULL,
	"content" text NOT NULL,
	"image_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "discord_tokens" ADD CONSTRAINT "discord_tokens_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;