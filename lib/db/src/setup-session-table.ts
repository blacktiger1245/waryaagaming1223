/**
 * Creates the connect-pg-simple session table if it does not already exist.
 *
 * This cannot live in the Drizzle schema because esbuild strips
 * connect-pg-simple's bundled table.sql at build time, making
 * createTableIfMissing fail silently at runtime. We run this script from
 * post-merge.sh instead and keep createTableIfMissing: false in app.ts.
 */
import pg from "pg";

const { Pool } = pg;

const connectionString =
  process.env["NEON_DATABASE_URL"] ?? process.env["DATABASE_URL"];

if (!connectionString) {
  throw new Error("DATABASE_URL must be set.");
}

const pool = new Pool({ connectionString });

await pool.query(`
  CREATE TABLE IF NOT EXISTS user_sessions (
    sid    VARCHAR      NOT NULL COLLATE "default",
    sess   JSON         NOT NULL,
    expire TIMESTAMP(6) NOT NULL
  ) WITH (OIDS=FALSE);
`);

// Add primary key only when it doesn't already exist to make this idempotent.
await pool.query(`
  DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'session_pkey'
        AND conrelid = 'user_sessions'::regclass
    ) THEN
      ALTER TABLE user_sessions
        ADD CONSTRAINT session_pkey
        PRIMARY KEY (sid) NOT DEFERRABLE INITIALLY IMMEDIATE;
    END IF;
  END
  $$;
`);

await pool.end();
console.log("user_sessions table ready");
