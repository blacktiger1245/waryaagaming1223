-- 0017_player_social_links.sql
-- Player-editable social media links, stored as canonical URLs.
-- Idempotent (ADD COLUMN IF NOT EXISTS).

ALTER TABLE "players" ADD COLUMN IF NOT EXISTS "tiktok_url" text;
ALTER TABLE "players" ADD COLUMN IF NOT EXISTS "facebook_url" text;
ALTER TABLE "players" ADD COLUMN IF NOT EXISTS "whatsapp_url" text;
ALTER TABLE "players" ADD COLUMN IF NOT EXISTS "instagram_url" text;
ALTER TABLE "players" ADD COLUMN IF NOT EXISTS "youtube_url" text;
ALTER TABLE "players" ADD COLUMN IF NOT EXISTS "twitter_url" text;
