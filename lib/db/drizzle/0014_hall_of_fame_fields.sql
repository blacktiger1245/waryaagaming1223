-- 0014_hall_of_fame_fields.sql
-- Extend hall_of_fame with season reference, active status, and stat snapshot.
-- Idempotent (ADD COLUMN IF NOT EXISTS).

ALTER TABLE "hall_of_fame" ADD COLUMN IF NOT EXISTS "season_id" integer;
ALTER TABLE "hall_of_fame" ADD COLUMN IF NOT EXISTS "status" boolean NOT NULL DEFAULT false;
ALTER TABLE "hall_of_fame" ADD COLUMN IF NOT EXISTS "games" integer NOT NULL DEFAULT 0;
ALTER TABLE "hall_of_fame" ADD COLUMN IF NOT EXISTS "trophies" integer NOT NULL DEFAULT 0;
ALTER TABLE "hall_of_fame" ADD COLUMN IF NOT EXISTS "goals" integer NOT NULL DEFAULT 0;
ALTER TABLE "hall_of_fame" ADD COLUMN IF NOT EXISTS "motm_awards" integer NOT NULL DEFAULT 0;
ALTER TABLE "hall_of_fame" ADD COLUMN IF NOT EXISTS "updated_at" timestamp NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS "hall_of_fame_status_idx" ON "hall_of_fame" ("status");
CREATE INDEX IF NOT EXISTS "hall_of_fame_player_idx" ON "hall_of_fame" ("player_id");
CREATE INDEX IF NOT EXISTS "hall_of_fame_season_idx" ON "hall_of_fame" ("season_id");