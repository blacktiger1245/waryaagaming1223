---
name: connect-pg-simple session table creation fails under esbuild bundle
description: createTableIfMissing throws ENOENT for table.sql when connect-pg-simple is bundled by esbuild (asset file isn't copied to dist)
---

When using `connect-pg-simple` as the express-session store in a server bundled with esbuild (CJS/ESM single-file bundle), `createTableIfMissing: true` fails at runtime with:

`Error: ENOENT: no such file or directory, open '.../dist/table.sql'`

**Why:** connect-pg-simple ships a `table.sql` file it reads from its own package directory at runtime to auto-create the sessions table. esbuild bundles the JS but does not copy that non-JS asset into `dist/`, so the relative path lookup fails silently on every session read/write (sessions never persist — login endpoints return 200 but the session is lost on the next request, looking like a broken auth flow).

**How to apply:** For any bundled (esbuild/webpack) Node server using connect-pg-simple:
1. Create the sessions table manually via SQL once (columns: sid varchar PK, sess json, expire timestamp(6), plus an index on expire).
2. Set `createTableIfMissing: false` in the PgStore config so it never tries to read table.sql.
