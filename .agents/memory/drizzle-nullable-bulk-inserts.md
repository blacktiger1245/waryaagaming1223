---
name: Drizzle nullable bulk inserts
description: A production compatibility constraint for multi-row inserts using nullable columns.
---

Avoid relying on Drizzle multi-row inserts when rows explicitly set nullable fields to `null`; use separate inserts inside the same transaction or an explicit SQL statement with uniform tuples.

**Why:** A deployed Drizzle version generated value tuples with different placeholder counts for the same multi-row insert, causing PostgreSQL to reject team registration.

**How to apply:** Treat nullable bulk inserts as a compatibility risk in this project, especially when the Northflank build may not match the Replit dependency tree exactly.

Initial team creation should not write `player_transfers` rows at all: assigning unteamed players to their first team is roster initialization, not a transfer. Only later add/remove operations need transfer history.

**Why:** Northflank may still have an older `player_transfers` constraint that rejects a null `from_team_id`, and initial registration does not need that history record.

**How to apply:** Keep new-team registration independent of the legacy transfer-history table while preserving transfer writes for subsequent roster changes.