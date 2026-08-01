#!/bin/bash
set -e
pnpm install --frozen-lockfile
pnpm --filter @workspace/db run push

# Create the connect-pg-simple session table.
# This cannot go in the Drizzle schema because esbuild strips connect-pg-simple's
# bundled table.sql at build time, so createTableIfMissing fails silently at runtime.
# We create it here instead and keep createTableIfMissing: false in src/app.ts.
pnpm --filter @workspace/db run setup-session-table
