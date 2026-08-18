-- Team roles: add the President (owner) role.
-- Existing teams have no president; the person who registered them was stored
-- as coachId, so backfill president_id from coach_id (or captain_id as fallback).
ALTER TABLE "teams" ADD COLUMN IF NOT EXISTS "president_id" integer;
UPDATE "teams" SET "president_id" = COALESCE("coach_id", "captain_id") WHERE "president_id" IS NULL;
