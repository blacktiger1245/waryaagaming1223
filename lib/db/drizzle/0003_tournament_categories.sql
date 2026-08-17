-- Additive migration: tournament categories + tournament stage config
-- Safe to run: CREATE TABLE / ADD COLUMN IF NOT EXISTS only.

CREATE TABLE IF NOT EXISTS "tournament_categories" (
  "id" serial PRIMARY KEY,
  "name" text NOT NULL,
  "logo_url" text,
  "created_by" integer,
  "created_at" timestamp NOT NULL DEFAULT now()
);

ALTER TABLE "tournaments" ADD COLUMN IF NOT EXISTS "category_id" integer;
ALTER TABLE "tournaments" ADD COLUMN IF NOT EXISTS "qualify_count" integer;
ALTER TABLE "tournaments" ADD COLUMN IF NOT EXISTS "third_place_match" boolean NOT NULL DEFAULT false;
