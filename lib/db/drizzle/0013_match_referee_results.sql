-- 0013_match_referee_results.sql
-- Add referee assignment + result-audit columns to "matches".
-- Idempotent (ADD COLUMN IF NOT EXISTS) so it can be applied repeatedly.

ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "assigned_referee_id" integer;
ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "result_set_by" integer;
ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "result_set_at" timestamp;

CREATE INDEX IF NOT EXISTS "matches_assigned_referee_idx" ON "matches" ("assigned_referee_id");
CREATE INDEX IF NOT EXISTS "matches_result_set_at_idx" ON "matches" ("result_set_at");