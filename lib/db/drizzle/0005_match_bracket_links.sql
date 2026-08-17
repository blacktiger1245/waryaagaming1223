-- Stage 2 Knock-out bracket relationship columns (additive, safe).
ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "parent_match1_id" integer;
ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "parent_match2_id" integer;
ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "next_match_id" integer;
ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "next_slot" integer;
