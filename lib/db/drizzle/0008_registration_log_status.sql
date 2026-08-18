-- 0008_registration_log_status.sql
-- Adds a Status column to team_member_devices so the Admin Panel can track and
-- edit each submission's status (pending / approved / rejected).

ALTER TABLE "team_member_devices"
  ADD COLUMN IF NOT EXISTS "status" text NOT NULL DEFAULT 'pending';