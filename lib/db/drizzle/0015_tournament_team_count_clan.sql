-- 0015_tournament_team_count_clan.sql
-- Add team_count and is_clan_tournament to tournaments table.
-- Idempotent (ADD COLUMN IF NOT EXISTS).

ALTER TABLE "tournaments" ADD COLUMN IF NOT EXISTS "team_count" integer;
ALTER TABLE "tournaments" ADD COLUMN IF NOT EXISTS "is_clan_tournament" boolean NOT NULL DEFAULT false;
