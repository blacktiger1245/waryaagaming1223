-- ===========================================================================
-- Waryaa Gaming — add 8 FAKE clans (4 FAKE players each) to tournament "f"
--
-- Fully ADDITIVE and idempotent:
--   • creates 8 new clans named "Fake Clan <Alpha..Hotel>"
--   • creates 32 new fake players (usernames fake_<tag>_p1..4 — the same
--     "fake_" prefix the repo's remove-fake-data.mjs already recognises)
--   • enrols each clan in the tournament and writes its 4-player line-up
--   • NEVER reads, moves, updates or deletes an existing/real player, clan,
--     participant or any other record
--
-- Safe to run repeatedly. The whole routine is one DO block == one transaction,
-- so any guard failure rolls back everything.
-- ===========================================================================

DO $$
DECLARE
  v_name    constant text    := 'f';        -- tournament name
  v_clans   constant integer := 8;          -- number of fake clans
  v_perclan constant integer := 4;          -- fake players per clan
  v_prefix  constant text    := 'fake_';    -- fake-player username prefix
  v_names   text[] := ARRAY['Fake Clan Alpha','Fake Clan Bravo','Fake Clan Charlie','Fake Clan Delta',
                            'Fake Clan Echo','Fake Clan Foxtrot','Fake Clan Golf','Fake Clan Hotel'];
  v_tags    text[] := ARRAY['fca','fcb','fcc','fcd','fce','fcf','fcg','fch'];
  v_tid     integer;
  v_hits    integer;
  v_ids     text;
  v_team    integer;
  v_pteam   integer;
  v_foreign text;
  v_uname   text;
  v_pid     integer;
  v_leader  integer;
  v_total   integer := 0;
  i         integer;
  k         integer;
BEGIN
  -- ── GUARD 1 — the tournament name must be unique ──────────────────────────
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

  -- ── GUARD 2 — a "Fake Clan ..." team must never hold a non-fake player ─────
  FOR i IN 1..v_clans LOOP
    SELECT id INTO v_team FROM teams WHERE name = v_names[i];
    IF v_team IS NOT NULL THEN
      SELECT string_agg('player id ' || p.id || ' (' || p.username || ')', '; ') INTO v_foreign
        FROM players p
       WHERE p.team_id = v_team
         AND left(coalesce(p.username, ''), length(v_prefix)) <> v_prefix;
      IF v_foreign IS NOT NULL THEN
        RAISE EXCEPTION 'Clan "%" already contains non-fake players: %. Aborting — nothing was changed.',
                        v_names[i], v_foreign;
      END IF;
    END IF;
  END LOOP;

  -- ── CREATE + ASSIGN (additive only) ───────────────────────────────────────
  FOR i IN 1..v_clans LOOP
    SELECT id INTO v_team FROM teams WHERE name = v_names[i] LIMIT 1;
    IF v_team IS NULL THEN
      INSERT INTO teams (name, tag, division, description)
      VALUES (v_names[i], upper(v_tags[i]), 'serie_a', 'Test clan team seeded for tournament testing.')
      RETURNING id INTO v_team;
    END IF;

    FOR k IN 1..v_perclan LOOP
      v_uname := v_prefix || v_tags[i] || '_p' || k;

      SELECT id INTO v_pid FROM players WHERE username = v_uname;
      IF v_pid IS NULL THEN
        INSERT INTO players (username, display_name, role, is_active, profile_complete, country)
        VALUES (v_uname, v_names[i] || ' P' || k, 'player', true, false, 'SO')
        RETURNING id INTO v_pid;
        v_total := v_total + 1;
      END IF;

      -- move ONLY our own fake player, and only if it is unassigned / already here
      UPDATE players SET team_id = v_team
       WHERE id = v_pid AND (team_id IS NULL OR team_id = v_team);

      SELECT team_id INTO v_pteam FROM players WHERE id = v_pid;
      IF v_pteam IS DISTINCT FROM v_team THEN
        RAISE EXCEPTION 'Fake player "%" (id %) is already in team %. Aborting — nothing was changed.',
                        v_uname, v_pid, coalesce(v_pteam::text, 'NULL');
      END IF;

      INSERT INTO tournament_team_rosters (tournament_id, team_id, player_id)
      VALUES (v_tid, v_team, v_pid)
      ON CONFLICT (tournament_id, team_id, player_id) DO NOTHING;
    END LOOP;

    -- captain/president only if the seat is empty (never overwrite)
    SELECT min(player_id) INTO v_leader
      FROM tournament_team_rosters
     WHERE tournament_id = v_tid AND team_id = v_team;
    IF v_leader IS NOT NULL THEN
      UPDATE teams
         SET captain_id   = COALESCE(captain_id, v_leader),
             president_id = COALESCE(president_id, v_leader)
       WHERE id = v_team;
    END IF;

    -- enrol the clan exactly once
    IF NOT EXISTS (SELECT 1 FROM tournament_participants
                    WHERE tournament_id = v_tid AND team_id = v_team) THEN
      INSERT INTO tournament_participants (tournament_id, type, player_id, team_id, seed)
      VALUES (v_tid, 'team', NULL, v_team, NULL);
    END IF;
  END LOOP;

  RAISE NOTICE 'Added % fake clans (% new fake players) to tournament #% "%".',
               v_clans, v_total, v_tid, v_name;
END $$;

-- Verification — the fake clans and their player counts
SELECT c.name AS clan, c.tag, count(r.player_id)::int AS players
  FROM teams c
  LEFT JOIN tournament_team_rosters r
         ON r.team_id = c.id
        AND r.tournament_id = (SELECT id FROM tournaments WHERE lower(name) = 'f' ORDER BY id LIMIT 1)
 WHERE c.name LIKE 'Fake Clan %'
 GROUP BY c.name, c.tag
 ORDER BY c.name;
