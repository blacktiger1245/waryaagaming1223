-- ===========================================================================
-- Waryaa Gaming — SAFE, idempotent seeding of the clan tournament named "f"
--
-- Guarantees (mapped to the review requirements):
--   1. Never transfers / reassigns any EXISTING player (real or free agent).
--   2. Creates 32 DEDICATED players — exactly 4 per clan.
--   3. Never removes / overwrites / modifies an existing real player.
--   4. Guarantees exactly 4 unique line-up entries per clan.
--   5. Fully idempotent — safe to run repeatedly.
--   6. Aborts if the tournament name is not unique (reports the ids).
--   7. Leaves every other tournament participant untouched.
--   8. Deletes nothing (never removes participant #645 or any other record).
--   9. Runs in ONE transaction — the whole DO block is a single atomic
--      statement, so any guard failure rolls back every change.
--  10. Column/constraint names verified against the live Neon schema:
--        players(username UNIQUE) · teams(name UNIQUE)
--        tournament_team_rosters UNIQUE(tournament_id,team_id,player_id)
--        tournament_participants only has PK(id) -> inserts guarded by NOT EXISTS
--
-- If a target clan already holds players this script did not create, it ABORTS
-- (and rolls back) and prints exactly what it found — nothing is overwritten.
-- ===========================================================================
-- NOTE: the entire routine is a single DO block, which PostgreSQL executes as
-- one transaction. If any guard raises, ALL of its changes roll back — no
-- BEGIN/COMMIT is needed (and none is used, so a failed run never leaves your
-- SQL session stuck in an aborted transaction).
-- ===========================================================================

DO $$
DECLARE
  v_name    constant text    := 'f';        -- tournament name
  v_clans   constant integer := 8;          -- number of clans
  v_perclan constant integer := 4;          -- dedicated players per clan
  v_prefix  constant text    := 'seed_f_';  -- username prefix of our dedicated players
  v_names   text[] := ARRAY['Waryaa Sharks','Hargeisa Titans','Mogadishu Storm','Berbera Blades',
                            'Kismayo Kraken','Bosaso Bulls','Baidoa Bolt','Garowe Guardians'];
  v_tags    text[] := ARRAY['wys','hgt','mgs','bbb','ksk','bsb','bdb','grg'];
  v_tid     integer;
  v_hits    integer;
  v_ids     text;
  v_team    integer;
  v_pteam   integer;
  v_foreign text;
  v_uname   text;
  v_pid     integer;
  v_leader  integer;
  v_count   integer;
  v_total   integer := 0;
  i         integer;
  k         integer;
BEGIN
  -- ── GUARD 1 — the tournament name must be unique (req 6) ──────────────────
  SELECT count(*) INTO v_hits FROM tournaments WHERE lower(name) = lower(v_name);
  IF v_hits = 0 THEN
    RAISE EXCEPTION 'No tournament named "%" exists. Nothing was changed.', v_name;
  ELSIF v_hits > 1 THEN
    SELECT string_agg(id::text, ', ' ORDER BY id) INTO v_ids
      FROM tournaments WHERE lower(name) = lower(v_name);
    RAISE EXCEPTION 'Ambiguous: % tournaments are named "%" (ids: %). Aborting — nothing was changed.',
                    v_hits, v_name, v_ids;
  END IF;
  SELECT id INTO v_tid FROM tournaments WHERE lower(name) = lower(v_name);

  -- ── GUARD 2 — target clans must not already contain players we did not make ─
  -- This is what keeps "exactly 4 per clan" true WITHOUT deleting anything and
  -- WITHOUT touching a single existing player (req 1, 3, 4, 8).
  FOR i IN 1..v_clans LOOP
    SELECT id INTO v_team FROM teams WHERE name = v_names[i];
    IF v_team IS NOT NULL THEN
      SELECT string_agg(msg, '; ') INTO v_foreign FROM (
        SELECT 'member id ' || p.id || ' (' || p.username || ')' AS msg
          FROM players p
         WHERE p.team_id = v_team
           AND left(coalesce(p.username, ''), length(v_prefix)) <> v_prefix
        UNION ALL
        SELECT 'line-up player id ' || r.player_id AS msg
          FROM tournament_team_rosters r
          JOIN players p2 ON p2.id = r.player_id
         WHERE r.tournament_id = v_tid
           AND r.team_id = v_team
           AND left(coalesce(p2.username, ''), length(v_prefix)) <> v_prefix
      ) x;

      IF v_foreign IS NOT NULL THEN
        RAISE EXCEPTION 'Clan "%" (id %) already has non-seeded players: %. Aborting so no existing player is touched — nothing was changed.',
                        v_names[i], v_team, v_foreign;
      END IF;
    END IF;
  END LOOP;

  -- ── CREATE + ASSIGN (additive only — never touches an existing player) ────
  FOR i IN 1..v_clans LOOP
    -- find or create the clan
    SELECT id INTO v_team FROM teams WHERE name = v_names[i] LIMIT 1;
    IF v_team IS NULL THEN
      INSERT INTO teams (name, tag, division)
      VALUES (v_names[i], upper(v_tags[i]), 'serie_a')
      RETURNING id INTO v_team;
    END IF;

    -- exactly v_perclan dedicated players for this clan
    FOR k IN 1..v_perclan LOOP
      v_uname := v_prefix || v_tags[i] || '_p' || k;

      SELECT id INTO v_pid FROM players WHERE username = v_uname;
      IF v_pid IS NULL THEN
        INSERT INTO players (username, display_name, role, is_active, profile_complete, country)
        VALUES (v_uname, v_names[i] || ' P' || k, 'player', true, false, 'SO')
        RETURNING id INTO v_pid;
        v_total := v_total + 1;
      END IF;

      -- move ONLY our own dedicated player, and ONLY if it is unassigned or
      -- already in this clan (never steal a player from another team)
      UPDATE players SET team_id = v_team
       WHERE id = v_pid AND (team_id IS NULL OR team_id = v_team);

      SELECT team_id INTO v_pteam FROM players WHERE id = v_pid;
      IF v_pteam IS DISTINCT FROM v_team THEN
        RAISE EXCEPTION 'Dedicated player "%" (id %) is already in team %. Aborting — nothing was changed.',
                        v_uname, v_pid, coalesce(v_pteam::text, 'NULL');
      END IF;

      INSERT INTO tournament_team_rosters (tournament_id, team_id, player_id)
      VALUES (v_tid, v_team, v_pid)
      ON CONFLICT (tournament_id, team_id, player_id) DO NOTHING;
    END LOOP;

    -- fill the Captain / President seat ONLY if it is empty (never overwrite)
    SELECT min(player_id) INTO v_leader
      FROM tournament_team_rosters
     WHERE tournament_id = v_tid AND team_id = v_team;

    IF v_leader IS NOT NULL THEN
      UPDATE teams
         SET captain_id   = COALESCE(captain_id, v_leader),
             president_id = COALESCE(president_id, v_leader)
       WHERE id = v_team;
    END IF;

    -- enrol the clan EXACTLY ONCE (additive; other participants untouched)
    IF NOT EXISTS (SELECT 1 FROM tournament_participants
                    WHERE tournament_id = v_tid AND team_id = v_team) THEN
      INSERT INTO tournament_participants (tournament_id, type, player_id, team_id, seed)
      VALUES (v_tid, 'team', NULL, v_team, NULL);
    END IF;
  END LOOP;

  -- ── FINAL CHECK — guarantee exactly v_perclan members AND line-up entries ──
  FOR i IN 1..v_clans LOOP
    SELECT id INTO v_team FROM teams WHERE name = v_names[i];

    SELECT count(*) INTO v_count FROM players WHERE team_id = v_team;
    IF v_count <> v_perclan THEN
      RAISE EXCEPTION 'Clan "%" would end up with % members (expected %). Aborting — nothing was changed.',
                      v_names[i], v_count, v_perclan;
    END IF;

    SELECT count(*) INTO v_count
      FROM tournament_team_rosters
     WHERE tournament_id = v_tid AND team_id = v_team;
    IF v_count <> v_perclan THEN
      RAISE EXCEPTION 'Clan "%" would end up with % line-up entries (expected %). Aborting — nothing was changed.',
                      v_names[i], v_count, v_perclan;
    END IF;
  END LOOP;

  -- ── TOURNAMENT MODE + COUNTERS (count only clans that still exist) ────────
  SELECT count(*) INTO v_count
    FROM tournament_participants tp
    JOIN teams t ON t.id = tp.team_id
   WHERE tp.tournament_id = v_tid;

  UPDATE tournaments
     SET is_clan_tournament   = true,
         tournament_type      = 'team',
         players_per_team     = v_perclan,
         team_count           = v_count,
         current_participants = v_count
   WHERE id = v_tid;

  RAISE NOTICE 'OK — tournament #% "%": % clans, % dedicated players/clan, % new players created.',
               v_tid, v_name, v_clans, v_perclan, v_total;
END $$;

-- Verification — only reached when every guard passed. (If a guard aborts the
-- DO block, the whole statement rolls back and this SELECT never runs.)
SELECT c.name AS clan, count(r.player_id)::int AS players
  FROM tournament_participants tp
  JOIN teams c ON c.id = tp.team_id
  LEFT JOIN tournament_team_rosters r
         ON r.tournament_id = tp.tournament_id AND r.team_id = tp.team_id
 WHERE tp.tournament_id = (SELECT id FROM tournaments WHERE lower(name) = 'f' ORDER BY id LIMIT 1)
 GROUP BY c.name
 ORDER BY c.name;
