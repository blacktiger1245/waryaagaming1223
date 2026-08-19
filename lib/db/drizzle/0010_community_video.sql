-- 0010_community_video.sql
-- Lets community posts optionally include a video (in addition to text/image).

ALTER TABLE "community_posts"
  ADD COLUMN IF NOT EXISTS "video_url" text;