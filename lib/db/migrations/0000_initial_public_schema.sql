-- ============================================================================
-- Waryaa Gaming - initial `public` schema (43 application tables)
-- ============================================================================
-- GENERATED from the application's own definitions:
--   * 40 tables : lib/db/src/schema/*.ts   (Drizzle ORM models)
--   *  3 tables : raw-SQL definitions in the repo (user_sessions,
--                 team_squad_images, tournament_team_rosters)
--   * indexes   : the union of the Drizzle models and the repo's SQL DDL
--
-- SAFETY
--   * Additive only: no DROP, TRUNCATE, DELETE or ALTER COLUMN TYPE.
--   * Every object uses IF NOT EXISTS, so re-running is a no-op.
--   * One transaction: it fully applies or fully rolls back.
--   * Touches ONLY the `public` schema. `neon_auth` is never referenced,
--     created, altered or dropped.
--   * No obsolete syntax (no WITH (OIDS=FALSE)).
--   * Constraints are named exactly as Drizzle names them, so a later
--     `drizzle-kit push` sees them as already present.
--
-- Target: a database whose `public` schema has no application tables.
-- ============================================================================

BEGIN;
-- ---- players -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "public"."players" (
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
	"coin_balance" integer DEFAULT 0 NOT NULL,
	"contract_seasons" integer,
	"contract_seasons_left" integer,
	"contract_signed_season_id" integer,
	"device_name" text,
	"konami_id" text,
	"blood_group" text,
	"tiktok_url" text,
	"facebook_url" text,
	"whatsapp_url" text,
	"instagram_url" text,
	"youtube_url" text,
	"twitter_url" text,
	"profile_complete" boolean DEFAULT false NOT NULL,
	"is_free_agent" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"badges" text[] DEFAULT '{}' NOT NULL,
	"role" text DEFAULT 'player' NOT NULL,
	"banned_until" timestamp,
	"ban_reason" text,
	"banned_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "players_username_unique" UNIQUE("username")
);

-- ---- user_sessions -------------------------------------------------------
CREATE TABLE IF NOT EXISTS "public"."user_sessions" (
	"sid" varchar NOT NULL COLLATE "default",
	"sess" json NOT NULL,
	"expire" timestamp(6) NOT NULL,
	CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid = 'public.user_sessions'::regclass AND contype = 'p') THEN
    ALTER TABLE "public"."user_sessions"
      ADD CONSTRAINT "session_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "public"."user_sessions" USING btree ("expire");

-- ---- seasons -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "public"."seasons" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"is_current" boolean DEFAULT false NOT NULL,
	"top_scorer_player_id" integer,
	"ballon_dor_player_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "seasons_name_unique" UNIQUE("name")
);

-- ---- teams ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "public"."teams" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"tag" text,
	"logo_url" text,
	"division" text DEFAULT 'serie_a' NOT NULL,
	"president_id" integer,
	"captain_id" integer NOT NULL,
	"coach_id" integer,
	"wins" integer DEFAULT 0 NOT NULL,
	"losses" integer DEFAULT 0 NOT NULL,
	"points" integer DEFAULT 0 NOT NULL,
	"banned_until" timestamp,
	"ban_reason" text,
	"banned_by" text,
	"description" text,
	"achievements" text[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "teams_name_unique" UNIQUE("name")
);

-- ---- discord_tokens ------------------------------------------------------
CREATE TABLE IF NOT EXISTS "public"."discord_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"player_id" integer NOT NULL,
	"access_token" text NOT NULL,
	"refresh_token" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"last_synced_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "discord_tokens_player_id_unique" UNIQUE("player_id"),
	CONSTRAINT "discord_tokens_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action
);

-- ---- tournaments ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS "public"."tournaments" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'upcoming' NOT NULL,
	"format" text DEFAULT 'single-elimination' NOT NULL,
	"game" text DEFAULT 'eFootball' NOT NULL,
	"max_participants" integer DEFAULT 16 NOT NULL,
	"current_participants" integer DEFAULT 0 NOT NULL,
	"prize_pool" text DEFAULT '$0' NOT NULL,
	"start_date" text,
	"end_date" text,
	"rules" text,
	"stream_url" text,
	"winner_id" integer,
	"winner_name" text,
	"logo_url" text,
	"hosted_by" text,
	"tournament_type" text DEFAULT 'solo' NOT NULL,
	"season_id" integer,
	"category_id" integer,
	"group_count" integer DEFAULT 4 NOT NULL,
	"qualify_count" integer,
	"third_place_match" boolean DEFAULT false NOT NULL,
	"team_count" integer,
	"is_clan_tournament" boolean DEFAULT false NOT NULL,
	"players_per_team" integer,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);

-- ---- tournament_categories -----------------------------------------------
CREATE TABLE IF NOT EXISTS "public"."tournament_categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"logo_url" text,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);

-- ---- tournament_participants ---------------------------------------------
CREATE TABLE IF NOT EXISTS "public"."tournament_participants" (
	"id" serial PRIMARY KEY NOT NULL,
	"tournament_id" integer NOT NULL,
	"type" text DEFAULT 'player' NOT NULL,
	"player_id" integer,
	"team_id" integer,
	"seed" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);

-- ---- tournament_admins ---------------------------------------------------
CREATE TABLE IF NOT EXISTS "public"."tournament_admins" (
	"id" serial PRIMARY KEY NOT NULL,
	"tournament_id" integer NOT NULL,
	"player_id" integer NOT NULL,
	"role" text DEFAULT 'admin' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tournament_admins_tournament_player_unique" UNIQUE("tournament_id","player_id")
);

-- ---- tournament_team_rosters ---------------------------------------------
CREATE TABLE IF NOT EXISTS "public"."tournament_team_rosters" (
	"id" serial PRIMARY KEY NOT NULL,
	"tournament_id" integer NOT NULL,
	"team_id" integer NOT NULL,
	"player_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ttr_unique" UNIQUE("tournament_id","team_id","player_id")
);

-- ---- matches -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "public"."matches" (
	"id" serial PRIMARY KEY NOT NULL,
	"tournament_id" integer NOT NULL,
	"round" integer DEFAULT 1 NOT NULL,
	"round_name" text,
	"stage" integer DEFAULT 1 NOT NULL,
	"parent_match1_id" integer,
	"parent_match2_id" integer,
	"next_match_id" integer,
	"next_slot" integer,
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
	"assigned_referee_id" integer,
	"result_set_by" integer,
	"result_set_at" timestamp,
	"participant1_yellow_cards" integer DEFAULT 0 NOT NULL,
	"participant1_red_cards" integer DEFAULT 0 NOT NULL,
	"participant2_yellow_cards" integer DEFAULT 0 NOT NULL,
	"participant2_red_cards" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "matches_assigned_referee_idx" ON "public"."matches" USING btree ("assigned_referee_id");
CREATE INDEX IF NOT EXISTS "matches_result_set_at_idx" ON "public"."matches" USING btree ("result_set_at");

-- ---- match_player_games --------------------------------------------------
CREATE TABLE IF NOT EXISTS "public"."match_player_games" (
	"id" serial PRIMARY KEY NOT NULL,
	"match_id" integer NOT NULL,
	"home_player_id" integer,
	"home_player_name" text,
	"away_player_id" integer,
	"away_player_name" text,
	"home_score" integer,
	"away_score" integer,
	"home_assists" integer,
	"away_assists" integer,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"home_possession" integer,
	"away_possession" integer,
	"home_shots" integer,
	"away_shots" integer,
	"home_shots_on_target" integer,
	"away_shots_on_target" integer,
	"home_corner_kicks" integer,
	"away_corner_kicks" integer,
	"home_offside" integer,
	"away_offside" integer,
	"home_free_kicks" integer,
	"away_free_kicks" integer,
	"home_fouls" integer,
	"away_fouls" integer,
	"home_successful_passes" integer,
	"away_successful_passes" integer,
	"home_crosses" integer,
	"away_crosses" integer,
	"home_interceptions" integer,
	"away_interceptions" integer,
	"home_tackles" integer,
	"away_tackles" integer,
	"home_saves" integer,
	"away_saves" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);

-- ---- match_result_submissions --------------------------------------------
CREATE TABLE IF NOT EXISTS "public"."match_result_submissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"fixture_id" integer NOT NULL,
	"player_game_id" integer,
	"submitted_by" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"image_path" text NOT NULL,
	"home_score" integer,
	"away_score" integer,
	"home_assists" integer,
	"away_assists" integer,
	"home_possession" integer,
	"away_possession" integer,
	"home_shots" integer,
	"away_shots" integer,
	"home_shots_on_target" integer,
	"away_shots_on_target" integer,
	"home_corner_kicks" integer,
	"away_corner_kicks" integer,
	"home_offside" integer,
	"away_offside" integer,
	"home_free_kicks" integer,
	"away_free_kicks" integer,
	"home_fouls" integer,
	"away_fouls" integer,
	"home_successful_passes" integer,
	"away_successful_passes" integer,
	"home_crosses" integer,
	"away_crosses" integer,
	"home_interceptions" integer,
	"away_interceptions" integer,
	"home_tackles" integer,
	"away_tackles" integer,
	"home_saves" integer,
	"away_saves" integer,
	"name_verification_status" text,
	"home_expected_name" text,
	"home_screenshot_name" text,
	"away_expected_name" text,
	"away_screenshot_name" text,
	"name_verification_notes" text,
	"assigned_home_player_id" integer,
	"assigned_home_player_name" text,
	"assigned_away_player_id" integer,
	"assigned_away_player_name" text,
	"rejection_reason" text,
	"ocr_metadata" text,
	"approved_by" integer,
	"approved_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "match_result_submissions_fixture_id_matches_id_fk" FOREIGN KEY ("fixture_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "match_result_submissions_player_game_id_match_player_games_id_fk" FOREIGN KEY ("player_game_id") REFERENCES "public"."match_player_games"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "match_result_submissions_submitted_by_players_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action
);
CREATE INDEX IF NOT EXISTS "match_result_submissions_player_game_idx" ON "public"."match_result_submissions" USING btree ("player_game_id");
CREATE INDEX IF NOT EXISTS "match_result_submissions_status_idx" ON "public"."match_result_submissions" USING btree ("status");
CREATE INDEX IF NOT EXISTS "match_result_submissions_fixture_idx" ON "public"."match_result_submissions" USING btree ("fixture_id");

-- ---- match_result_audit_log ----------------------------------------------
CREATE TABLE IF NOT EXISTS "public"."match_result_audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"admin_id" integer,
	"admin_name" text,
	"action" text NOT NULL,
	"fixture_id" integer NOT NULL,
	"submission_id" integer NOT NULL,
	"previous_status" text NOT NULL,
	"new_status" text NOT NULL,
	"rejection_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "match_result_audit_log_admin_id_players_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."players"("id") ON DELETE set null ON UPDATE no action,
	CONSTRAINT "match_result_audit_log_fixture_id_matches_id_fk" FOREIGN KEY ("fixture_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "match_result_audit_log_submission_id_match_result_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."match_result_submissions"("id") ON DELETE cascade ON UPDATE no action
);
CREATE INDEX IF NOT EXISTS "match_result_audit_log_fixture_idx" ON "public"."match_result_audit_log" USING btree ("fixture_id");

-- ---- hall_of_fame --------------------------------------------------------
CREATE TABLE IF NOT EXISTS "public"."hall_of_fame" (
	"id" serial PRIMARY KEY NOT NULL,
	"player_id" integer NOT NULL,
	"season_id" integer,
	"status" boolean DEFAULT false NOT NULL,
	"games" integer DEFAULT 0 NOT NULL,
	"trophies" integer DEFAULT 0 NOT NULL,
	"goals" integer DEFAULT 0 NOT NULL,
	"motm_awards" integer DEFAULT 0 NOT NULL,
	"achievement" text NOT NULL,
	"year" integer NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "hall_of_fame_status_idx" ON "public"."hall_of_fame" USING btree ("status");
CREATE INDEX IF NOT EXISTS "hall_of_fame_player_idx" ON "public"."hall_of_fame" USING btree ("player_id");
CREATE INDEX IF NOT EXISTS "hall_of_fame_season_idx" ON "public"."hall_of_fame" USING btree ("season_id");

-- ---- news ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "public"."news" (
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

-- ---- media ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "public"."media" (
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

-- ---- community_posts -----------------------------------------------------
CREATE TABLE IF NOT EXISTS "public"."community_posts" (
	"id" serial PRIMARY KEY NOT NULL,
	"author_id" integer NOT NULL,
	"content" text NOT NULL,
	"image_url" text,
	"video_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);

-- ---- community_post_likes ------------------------------------------------
CREATE TABLE IF NOT EXISTS "public"."community_post_likes" (
	"id" serial PRIMARY KEY NOT NULL,
	"post_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "community_post_likes_post_user" UNIQUE("post_id","user_id")
);

-- ---- community_post_comments ---------------------------------------------
CREATE TABLE IF NOT EXISTS "public"."community_post_comments" (
	"id" serial PRIMARY KEY NOT NULL,
	"post_id" integer NOT NULL,
	"author_id" integer NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);

-- ---- announcements -------------------------------------------------------
CREATE TABLE IF NOT EXISTS "public"."announcements" (
	"id" serial PRIMARY KEY NOT NULL,
	"message" text NOT NULL,
	"type" text DEFAULT 'info' NOT NULL,
	"link" text,
	"link_text" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);

-- ---- academy_posts -------------------------------------------------------
CREATE TABLE IF NOT EXISTS "public"."academy_posts" (
	"id" serial PRIMARY KEY NOT NULL,
	"category" text DEFAULT 'player_training' NOT NULL,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"image_url" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_published" boolean DEFAULT true NOT NULL,
	"updated_by" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

-- ---- ads -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "public"."ads" (
	"id" serial PRIMARY KEY NOT NULL,
	"video_url" text NOT NULL,
	"target_url" text NOT NULL,
	"close_after_seconds" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "ads_active_idx" ON "public"."ads" USING btree ("is_active");
CREATE INDEX IF NOT EXISTS "ads_created_at_idx" ON "public"."ads" USING btree ("created_at");

-- ---- clan_settings -------------------------------------------------------
CREATE TABLE IF NOT EXISTS "public"."clan_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"serie_a_registration_open" boolean DEFAULT true NOT NULL,
	"serie_b_registration_open" boolean DEFAULT false NOT NULL
);

-- ---- player_transfers ----------------------------------------------------
CREATE TABLE IF NOT EXISTS "public"."player_transfers" (
	"id" serial PRIMARY KEY NOT NULL,
	"player_id" integer NOT NULL,
	"from_team_id" integer,
	"to_team_id" integer,
	"transferred_at" timestamp DEFAULT now() NOT NULL
);

-- ---- player_follows ------------------------------------------------------
CREATE TABLE IF NOT EXISTS "public"."player_follows" (
	"id" serial PRIMARY KEY NOT NULL,
	"follower_id" integer NOT NULL,
	"following_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "player_follows_pair_unique" UNIQUE("follower_id","following_id")
);
CREATE INDEX IF NOT EXISTS "player_follows_following_idx" ON "public"."player_follows" USING btree ("following_id");

-- ---- direct_messages -----------------------------------------------------
CREATE TABLE IF NOT EXISTS "public"."direct_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"sender_id" integer NOT NULL,
	"recipient_id" integer NOT NULL,
	"content" text NOT NULL,
	"read_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "direct_messages_sender_idx" ON "public"."direct_messages" USING btree ("sender_id");
CREATE INDEX IF NOT EXISTS "direct_messages_recipient_idx" ON "public"."direct_messages" USING btree ("recipient_id");

-- ---- team_chat_messages --------------------------------------------------
CREATE TABLE IF NOT EXISTS "public"."team_chat_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"team_id" integer NOT NULL,
	"sender_id" integer NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "team_chat_messages_team_idx" ON "public"."team_chat_messages" USING btree ("team_id");

-- ---- agent_conversations -------------------------------------------------
CREATE TABLE IF NOT EXISTS "public"."agent_conversations" (
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
CREATE UNIQUE INDEX IF NOT EXISTS "agent_conversations_pair_unique" ON "public"."agent_conversations" USING btree ("agent_player_id", "player_id");

-- ---- agent_messages ------------------------------------------------------
CREATE TABLE IF NOT EXISTS "public"."agent_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversation_id" integer NOT NULL,
	"sender_player_id" integer NOT NULL,
	"sender_role" text NOT NULL,
	"text" text NOT NULL,
	"read_at" timestamp,
	"sent_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "agent_messages_conversation_idx" ON "public"."agent_messages" USING btree ("conversation_id");

-- ---- support_tickets -----------------------------------------------------
CREATE TABLE IF NOT EXISTS "public"."support_tickets" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"subject" text NOT NULL,
	"category" text DEFAULT 'general' NOT NULL,
	"status" text DEFAULT 'waiting' NOT NULL,
	"assigned_admin_id" integer,
	"closed_by_id" integer,
	"closed_at" timestamp,
	"user_unread" integer DEFAULT 0 NOT NULL,
	"admin_unread" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "support_tickets_user_idx" ON "public"."support_tickets" USING btree ("user_id");
CREATE INDEX IF NOT EXISTS "support_tickets_assigned_idx" ON "public"."support_tickets" USING btree ("assigned_admin_id");
CREATE INDEX IF NOT EXISTS "support_tickets_status_idx" ON "public"."support_tickets" USING btree ("status");

-- ---- support_ticket_messages ---------------------------------------------
CREATE TABLE IF NOT EXISTS "public"."support_ticket_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"ticket_id" integer NOT NULL,
	"sender_id" integer NOT NULL,
	"sender_role" text NOT NULL,
	"text" text NOT NULL,
	"attachment_path" text,
	"attachment_type" text,
	"attachment_name" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "support_messages_ticket_idx" ON "public"."support_ticket_messages" USING btree ("ticket_id");

-- ---- support_ticket_ratings ----------------------------------------------
CREATE TABLE IF NOT EXISTS "public"."support_ticket_ratings" (
	"id" serial PRIMARY KEY NOT NULL,
	"ticket_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"admin_id" integer NOT NULL,
	"rating" integer NOT NULL,
	"feedback" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "support_ratings_ticket_unique" UNIQUE("ticket_id")
);
CREATE INDEX IF NOT EXISTS "support_ratings_admin_idx" ON "public"."support_ticket_ratings" USING btree ("admin_id");

-- ---- admin_availability --------------------------------------------------
CREATE TABLE IF NOT EXISTS "public"."admin_availability" (
	"id" serial PRIMARY KEY NOT NULL,
	"admin_id" integer NOT NULL,
	"online" boolean DEFAULT false NOT NULL,
	"last_active_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "admin_availability_admin_unique" UNIQUE("admin_id")
);

-- ---- admin_notifications -------------------------------------------------
CREATE TABLE IF NOT EXISTS "public"."admin_notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"admin_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"ticket_id" integer NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "admin_notifications_admin_idx" ON "public"."admin_notifications" USING btree ("admin_id");
CREATE INDEX IF NOT EXISTS "admin_notifications_read_idx" ON "public"."admin_notifications" USING btree ("admin_id", "read");

-- ---- team_member_devices -------------------------------------------------
CREATE TABLE IF NOT EXISTS "public"."team_member_devices" (
	"id" serial PRIMARY KEY NOT NULL,
	"player_id" integer NOT NULL,
	"team_id" integer NOT NULL,
	"device_name" text NOT NULL,
	"serial_number" text NOT NULL,
	"screenshot_path" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "team_member_devices_player_id_unique" UNIQUE("player_id")
);

-- ---- team_squad_images ---------------------------------------------------
CREATE TABLE IF NOT EXISTS "public"."team_squad_images" (
	"id" serial PRIMARY KEY NOT NULL,
	"team_id" integer NOT NULL,
	"object_path" text NOT NULL,
	"caption" text,
	"uploaded_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);

-- ---- shop_products -------------------------------------------------------
CREATE TABLE IF NOT EXISTS "public"."shop_products" (
	"id" serial PRIMARY KEY NOT NULL,
	"category" text NOT NULL,
	"subcategory" text,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"price_cents" integer NOT NULL,
	"web_fee_cents" integer DEFAULT 0 NOT NULL,
	"total_price_cents" integer DEFAULT 0 NOT NULL,
	"profile_image_path" text,
	"gallery_paths" text[] DEFAULT '{}' NOT NULL,
	"team_strength" integer,
	"coin_amount" text,
	"coin_count" integer,
	"nitro_plan" text,
	"konami_id_linked" boolean DEFAULT false NOT NULL,
	"google_play_linked" boolean DEFAULT false NOT NULL,
	"game_center_linked" boolean DEFAULT false NOT NULL,
	"aqoonsi_id" text,
	"published" boolean DEFAULT false NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "shop_products_created_by_players_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."players"("id") ON DELETE set null ON UPDATE no action
);
CREATE INDEX IF NOT EXISTS "shop_products_category_idx" ON "public"."shop_products" USING btree ("category");
CREATE INDEX IF NOT EXISTS "shop_products_published_idx" ON "public"."shop_products" USING btree ("published");

-- ---- shop_orders ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS "public"."shop_orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer,
	"product_title" text NOT NULL,
	"category" text NOT NULL,
	"price_cents" integer NOT NULL,
	"web_fee_cents" integer DEFAULT 0 NOT NULL,
	"total_price_cents" integer DEFAULT 0 NOT NULL,
	"buyer_name" text NOT NULL,
	"buyer_contact" text NOT NULL,
	"buyer_phone" text,
	"buyer_discord" text,
	"product_image_path" text,
	"note" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"client_id" text NOT NULL,
	"user_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "shop_orders_product_id_shop_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."shop_products"("id") ON DELETE set null ON UPDATE no action,
	CONSTRAINT "shop_orders_user_id_players_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."players"("id") ON DELETE set null ON UPDATE no action
);
CREATE INDEX IF NOT EXISTS "shop_orders_client_idx" ON "public"."shop_orders" USING btree ("client_id");
CREATE INDEX IF NOT EXISTS "shop_orders_user_idx" ON "public"."shop_orders" USING btree ("user_id");

-- ---- shop_sell_submissions -----------------------------------------------
CREATE TABLE IF NOT EXISTS "public"."shop_sell_submissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"profile_image_path" text,
	"gallery_paths" text[] DEFAULT '{}' NOT NULL,
	"price_cents" integer NOT NULL,
	"team_strength" integer,
	"konami_id_linked" boolean DEFAULT false NOT NULL,
	"google_play_linked" boolean DEFAULT false NOT NULL,
	"game_center_linked" boolean DEFAULT false NOT NULL,
	"phone" text NOT NULL,
	"seller_name" text NOT NULL,
	"seller_discord" text NOT NULL,
	"notes" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"rejection_reason" text,
	"aqoonsi_id" text,
	"published_product_id" integer,
	"client_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "shop_sell_submissions_status_idx" ON "public"."shop_sell_submissions" USING btree ("status");
CREATE INDEX IF NOT EXISTS "shop_sell_submissions_client_idx" ON "public"."shop_sell_submissions" USING btree ("client_id");

-- ---- shop_order_chats ----------------------------------------------------
CREATE TABLE IF NOT EXISTS "public"."shop_order_chats" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "shop_order_chats_order_id_unique" UNIQUE("order_id"),
	CONSTRAINT "shop_order_chats_order_id_shop_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."shop_orders"("id") ON DELETE cascade ON UPDATE no action
);

-- ---- shop_chat_messages --------------------------------------------------
CREATE TABLE IF NOT EXISTS "public"."shop_chat_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"chat_id" integer NOT NULL,
	"sender_role" text NOT NULL,
	"sender_user_id" integer,
	"sender_name" text NOT NULL,
	"body" text,
	"image_path" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "shop_chat_messages_chat_id_shop_order_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."shop_order_chats"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "shop_chat_messages_sender_user_id_players_id_fk" FOREIGN KEY ("sender_user_id") REFERENCES "public"."players"("id") ON DELETE set null ON UPDATE no action
);
CREATE INDEX IF NOT EXISTS "shop_chat_messages_chat_idx" ON "public"."shop_chat_messages" USING btree ("chat_id");

-- ---- coin_transactions ---------------------------------------------------
CREATE TABLE IF NOT EXISTS "public"."coin_transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"player_id" integer NOT NULL,
	"package_id" text NOT NULL,
	"coins" integer NOT NULL,
	"price_usd" integer NOT NULL,
	"stripe_session_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "coin_transactions_stripe_session_id_unique" UNIQUE("stripe_session_id"),
	CONSTRAINT "coin_transactions_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action
);
COMMIT;
