-- 0009_player_verified.sql
-- Adds a verified badge flag so admins can mark players they want to verify.

ALTER TABLE "players"
  ADD COLUMN IF NOT EXISTS "verified" boolean NOT NULL DEFAULT false;