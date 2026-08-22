-- Waryaa Gaming - complete database schema (idempotent)
-- Safe to run on a fresh database AND an existing one (adds missing columns only).

-- 1. user_sessions (connect-pg-simple)
CREATE TABLE IF NOT EXISTS user_sessions (
  sid     varchar NOT NULL COLLATE "default",
  sess    json    NOT NULL,
  expire  timestamp(6) NOT NULL
) WITH (OIDS=FALSE);
CREATE INDEX IF NOT EXISTS IDX_session_expire ON user_sessions (expire);

-- 2. players
CREATE TABLE IF NOT EXISTS players (
  id serial PRIMARY KEY,
  username text NOT NULL UNIQUE,
  display_name text,
  avatar_url text,
  email text,
  team_id integer,
  "rank" integer DEFAULT 9999 NOT NULL,
  previous_rank integer DEFAULT 0 NOT NULL,
  tournament_wins integer DEFAULT 0 NOT NULL,
  win_rate real DEFAULT 0 NOT NULL,
  matches_played integer DEFAULT 0 NOT NULL,
  matches_won integer DEFAULT 0 NOT NULL,
  matches_lost integer DEFAULT 0 NOT NULL,
  loss_rate real DEFAULT 0 NOT NULL,
  points real DEFAULT 0 NOT NULL,
  country text,
  discord_id text,
  bio text,
  clean_sheets integer DEFAULT 0 NOT NULL,
  rating integer DEFAULT 0 NOT NULL,
  market_value integer DEFAULT 0 NOT NULL,
  goals_scored integer DEFAULT 0 NOT NULL,
  draws integer DEFAULT 0 NOT NULL,
  goals_conceded integer DEFAULT 0 NOT NULL,
  man_of_the_match integer DEFAULT 0 NOT NULL,
  yellow_cards integer DEFAULT 0 NOT NULL,
  red_cards integer DEFAULT 0 NOT NULL,
  gaming_device text,
  device_name text,
  konami_id text,
  blood_group text,
  profile_complete boolean DEFAULT false NOT NULL,
  is_free_agent boolean DEFAULT false NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  badges text[] DEFAULT '{}' NOT NULL,
  role text DEFAULT 'player' NOT NULL,
  banned_until timestamp,
  ban_reason text,
  banned_by text,
  created_at timestamp DEFAULT now() NOT NULL
);

-- 3. discord_tokens
CREATE TABLE IF NOT EXISTS discord_tokens (
  id serial PRIMARY KEY,
  player_id integer NOT NULL UNIQUE,
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  expires_at timestamp NOT NULL,
  last_synced_at timestamp DEFAULT now() NOT NULL
);

-- 4. teams
CREATE TABLE IF NOT EXISTS teams (
  id serial PRIMARY KEY,
  name text NOT NULL UNIQUE,
  tag text,
  logo_url text,
  president_id integer,
  captain_id integer NOT NULL,
  coach_id integer,
  wins integer DEFAULT 0 NOT NULL,
  losses integer DEFAULT 0 NOT NULL,
  points integer DEFAULT 0 NOT NULL,
  description text,
  achievements text[] DEFAULT '{}' NOT NULL,
  created_at timestamp DEFAULT now() NOT NULL
);

-- 5. tournaments
CREATE TABLE IF NOT EXISTS tournaments (
  id serial PRIMARY KEY,
  name text NOT NULL,
  description text,
  status text DEFAULT 'upcoming' NOT NULL,
  format text DEFAULT 'single-elimination' NOT NULL,
  game text DEFAULT 'eFootball' NOT NULL,
  max_participants integer DEFAULT 16 NOT NULL,
  current_participants integer DEFAULT 0 NOT NULL,
  prize_pool text DEFAULT '$0' NOT NULL,
  start_date text NOT NULL,
  end_date text,
  rules text,
  stream_url text,
  winner_id integer,
  winner_name text,
  logo_url text,
  hosted_by text,
  tournament_type text DEFAULT 'solo' NOT NULL,
  season_id integer,
  created_by integer,
  category_id integer,
  group_count integer DEFAULT 4 NOT NULL,
  qualify_count integer,
  third_place_match boolean DEFAULT false NOT NULL,
  created_at timestamp DEFAULT now() NOT NULL
);

-- 6. tournament_participants
CREATE TABLE IF NOT EXISTS tournament_participants (
  id serial PRIMARY KEY,
  tournament_id integer NOT NULL,
  type text DEFAULT 'player' NOT NULL,
  player_id integer,
  team_id integer,
  seed integer,
  created_at timestamp DEFAULT now() NOT NULL
);

-- 7. tournament_categories
CREATE TABLE IF NOT EXISTS tournament_categories (
  id serial PRIMARY KEY,
  name text NOT NULL,
  logo_url text,
  created_by integer,
  created_at timestamp DEFAULT now() NOT NULL
);

-- 8. tournament_admins
CREATE TABLE IF NOT EXISTS tournament_admins (
  id serial PRIMARY KEY,
  tournament_id integer NOT NULL,
  player_id integer NOT NULL,
  role text DEFAULT 'admin' NOT NULL,
  created_at timestamp DEFAULT now() NOT NULL,
  CONSTRAINT tournament_admins_tournament_player_unique UNIQUE(tournament_id, player_id)
);

-- 9. matches
CREATE TABLE IF NOT EXISTS matches (
  id serial PRIMARY KEY,
  tournament_id integer NOT NULL,
  "round" integer DEFAULT 1 NOT NULL,
  round_name text,
  stage integer DEFAULT 1 NOT NULL,
  parent_match1_id integer,
  parent_match2_id integer,
  next_match_id integer,
  next_slot integer,
  status text DEFAULT 'scheduled' NOT NULL,
  participant1_id integer,
  participant1_name text,
  participant1_score integer,
  participant2_id integer,
  participant2_name text,
  participant2_score integer,
  winner_id integer,
  winner_name text,
  scheduled_at text,
  stream_url text,
  man_of_the_match_id integer,
  man_of_the_match_name text,
  participant1_yellow_cards integer DEFAULT 0 NOT NULL,
  participant1_red_cards integer DEFAULT 0 NOT NULL,
  participant2_yellow_cards integer DEFAULT 0 NOT NULL,
  participant2_red_cards integer DEFAULT 0 NOT NULL,
  created_at timestamp DEFAULT now() NOT NULL
);

-- 10. match_player_games
CREATE TABLE IF NOT EXISTS match_player_games (
  id serial PRIMARY KEY,
  match_id integer NOT NULL,
  home_player_id integer,
  home_player_name text,
  away_player_id integer,
  away_player_name text,
  home_score integer,
  away_score integer,
  status text DEFAULT 'scheduled' NOT NULL,
  created_at timestamp DEFAULT now() NOT NULL
);

-- 11. hall_of_fame
CREATE TABLE IF NOT EXISTS hall_of_fame (
  id serial PRIMARY KEY,
  player_id integer NOT NULL,
  achievement text NOT NULL,
  "year" integer NOT NULL,
  description text,
  created_at timestamp DEFAULT now() NOT NULL
);

-- 12. news
CREATE TABLE IF NOT EXISTS news (
  id serial PRIMARY KEY,
  title text NOT NULL,
  slug text NOT NULL UNIQUE,
  category text DEFAULT 'community' NOT NULL,
  content text NOT NULL,
  excerpt text,
  image_url text,
  author_id integer,
  author_name text,
  team_id integer,
  is_featured boolean DEFAULT false NOT NULL,
  published_at timestamp DEFAULT now() NOT NULL,
  created_at timestamp DEFAULT now() NOT NULL
);

-- 13. media
CREATE TABLE IF NOT EXISTS media (
  id serial PRIMARY KEY,
  title text NOT NULL,
  platform text NOT NULL,
  url text NOT NULL,
  embed_url text NOT NULL,
  thumbnail_url text,
  description text,
  published_at text,
  created_at timestamp DEFAULT now() NOT NULL
);

-- 14. community_posts
CREATE TABLE IF NOT EXISTS community_posts (
  id serial PRIMARY KEY,
  author_id integer NOT NULL,
  content text NOT NULL,
  image_url text,
  created_at timestamp DEFAULT now() NOT NULL
);

-- 15. community_post_likes
CREATE TABLE IF NOT EXISTS community_post_likes (
  id serial PRIMARY KEY,
  post_id integer NOT NULL,
  user_id integer NOT NULL,
  created_at timestamp DEFAULT now() NOT NULL,
  CONSTRAINT community_post_likes_post_user UNIQUE(post_id, user_id)
);

-- 16. community_post_comments
CREATE TABLE IF NOT EXISTS community_post_comments (
  id serial PRIMARY KEY,
  post_id integer NOT NULL,
  author_id integer NOT NULL,
  content text NOT NULL,
  created_at timestamp DEFAULT now() NOT NULL
);

-- 17. seasons
CREATE TABLE IF NOT EXISTS seasons (
  id serial PRIMARY KEY,
  name text NOT NULL UNIQUE,
  is_current boolean DEFAULT false NOT NULL,
  created_at timestamp DEFAULT now() NOT NULL
);

-- 18. player_transfers
CREATE TABLE IF NOT EXISTS player_transfers (
  id serial PRIMARY KEY,
  player_id integer NOT NULL,
  from_team_id integer,
  to_team_id integer,
  transferred_at timestamp DEFAULT now() NOT NULL
);

-- 19. agent_conversations
CREATE TABLE IF NOT EXISTS agent_conversations (
  id serial PRIMARY KEY,
  agent_player_id integer NOT NULL,
  player_id integer NOT NULL,
  unread_by_agent integer DEFAULT 0 NOT NULL,
  unread_by_player integer DEFAULT 0 NOT NULL,
  player_last_seen_at timestamp,
  agent_last_seen_at timestamp,
  created_at timestamp DEFAULT now() NOT NULL,
  updated_at timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS agent_conversations_pair_unique ON agent_conversations (agent_player_id, player_id);

-- 20. agent_messages
CREATE TABLE IF NOT EXISTS agent_messages (
  id serial PRIMARY KEY,
  conversation_id integer NOT NULL,
  sender_player_id integer NOT NULL,
  sender_role text NOT NULL,
  text text NOT NULL,
  read_at timestamp,
  sent_at timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS agent_messages_conversation_idx ON agent_messages (conversation_id);

-- 21. team_squad_images (used via raw SQL in the teams route)
CREATE TABLE IF NOT EXISTS team_squad_images (
  id serial PRIMARY KEY,
  team_id integer NOT NULL,
  object_path text NOT NULL,
  caption text,
  uploaded_by integer,
  created_at timestamp DEFAULT now() NOT NULL
);

-- Foreign key (discord_tokens -> players). Dropped first so this whole file is
-- safe to run more than once on an existing database.
ALTER TABLE discord_tokens DROP CONSTRAINT IF EXISTS discord_tokens_player_id_players_id_fk;
ALTER TABLE discord_tokens ADD CONSTRAINT discord_tokens_player_id_players_id_fk FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE;

-- ---- Upgrade existing tables: add missing columns (safe/no-op if present) ----
ALTER TABLE players ADD COLUMN IF NOT EXISTS is_free_agent boolean DEFAULT false NOT NULL;
ALTER TABLE players ADD COLUMN IF NOT EXISTS banned_until timestamp;
ALTER TABLE players ADD COLUMN IF NOT EXISTS ban_reason text;
ALTER TABLE players ADD COLUMN IF NOT EXISTS banned_by text;

ALTER TABLE teams ADD COLUMN IF NOT EXISTS president_id integer;

ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS season_id integer;
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS created_by integer;
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS category_id integer;
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS group_count integer DEFAULT 4 NOT NULL;
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS qualify_count integer;
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS third_place_match boolean DEFAULT false NOT NULL;

ALTER TABLE matches ADD COLUMN IF NOT EXISTS stage integer DEFAULT 1 NOT NULL;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS parent_match1_id integer;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS parent_match2_id integer;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS next_match_id integer;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS next_slot integer;

ALTER TABLE tournament_admins ADD COLUMN IF NOT EXISTS role text DEFAULT 'admin' NOT NULL;
