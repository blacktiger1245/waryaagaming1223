---
name: Drizzle nullable bulk inserts
description: A production compatibility constraint for multi-row inserts using nullable columns.
---

Avoid relying on Drizzle multi-row inserts when rows explicitly set nullable fields to `null`; use separate inserts inside the same transaction or an explicit SQL statement with uniform tuples.

**Why:** A deployed Drizzle version generated value tuples with different placeholder counts for the same multi-row insert, causing PostgreSQL to reject team registration.

**How to apply:** Treat nullable bulk inserts as a compatibility risk in this project, especially when the Northflank build may not match the Replit dependency tree exactly.