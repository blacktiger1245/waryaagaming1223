---
name: Matches table participant IDs
description: What participant1_id / participant2_id in the matches table actually store, and how the sync engine reads them.
---

## Rule
`matches.participant1_id` and `matches.participant2_id` are **player IDs** (`players.id`), not `tournament_participants.id`.

**Why:** The original DB data had a mismatch — matches stored `tournament_participants.id` but the match-history API queried by `players.id`, so history was always empty. Fixed July 2026 by SQL updating all participant IDs from names, and by rewriting the sync engine + generate-match helpers to use player IDs directly.

## How to apply
- Sync engine (admin.ts): compare `m.participant1Id === playerId` directly — no tp lookup needed.
- `generate-matches`: store `p.playerId` (not `p.id`) in each match row.
- `winner_id` in matches is also a player ID.
- Match history API (`/players/:id/match-history`): queries `participant1_id = playerId OR participant2_id = playerId` — correct as-is.
- Win/loss detection in the frontend: derive from scores (`myScore > oppScore`), not from `winnerId` which can be null.
