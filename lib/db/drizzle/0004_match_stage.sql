ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "stage" integer NOT NULL DEFAULT 1;
-- Backfill: mark existing knockout matches (by knockout round names) as stage 2.
UPDATE "matches" SET "stage" = 2
WHERE "round_name" ~* '(Quarter Finals|Semi Finals|Final|Round of|Third Place)';
