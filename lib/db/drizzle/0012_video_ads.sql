-- 0012_video_ads.sql
-- WG Video interstitial advertisements. Idempotent (IF NOT EXISTS) so it can be
-- applied repeatedly on any environment safely. The video payload itself is
-- stored in object storage (R2); this table only keeps the /objects/... path.

CREATE TABLE IF NOT EXISTS "ads" (
  "id" serial PRIMARY KEY NOT NULL,
  "video_url" text NOT NULL,
  "target_url" text NOT NULL,
  "close_after_seconds" integer NOT NULL,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_by" integer NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "ads_active_idx" ON "ads" ("is_active");
CREATE INDEX IF NOT EXISTS "ads_created_at_idx" ON "ads" ("created_at");