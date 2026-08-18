-- 0007_member_device_submissions.sql
-- WG Team Member Registration: stores each member's device serial number +
-- proof screenshot so a player can submit their details once per team.

CREATE TABLE IF NOT EXISTS team_member_devices (
  id serial PRIMARY KEY,
  player_id integer NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  team_id integer NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  device_name text NOT NULL,
  serial_number text NOT NULL,
  screenshot_path text NOT NULL,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS team_member_devices_player_unique
  ON team_member_devices (player_id);