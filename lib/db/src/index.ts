import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

const connectionString = process.env.NEON_DATABASE_URL ?? process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Bounded connection/query timeouts so a stalled or unreachable database can
// never hang a request (or the boot sequence) forever — `pg`'s default
// connectionTimeoutMillis is 0, which means "wait indefinitely".
export const pool = new Pool({
  connectionString,
  max: 10,
  connectionTimeoutMillis: 10_000, // initial TCP/TLS connect
  idleTimeoutMillis: 30_000,
  statement_timeout: 30_000, // server-side statement timeout
  query_timeout: 35_000, // client-side query timeout
});

// `pg` emits 'error' on the pool when an IDLE client fails (backend restart,
// network partition, Neon idle disconnect). With no listener, Node raises an
// uncaught error and the API process dies — leaving nginx returning 502 with
// nothing listening on :5000. Log it and let the pool discard the client
// instead. Values are never logged; the message is sanitized.
pool.on("error", (err) => {
  const code = (err as { code?: string }).code ?? null;
  const message =
    err instanceof Error
      ? err.message.replace(/\/\/[^@\s/]+@/g, "//[redacted]@")
      : String(err);
  console.error(
    JSON.stringify({
      level: "error",
      msg: "Unexpected error on idle PostgreSQL client",
      code,
      error: message,
    }),
  );
});

export const db = drizzle(pool, { schema });

export * from "./schema";
