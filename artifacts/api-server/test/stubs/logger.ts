/**
 * Test stub for `src/lib/logger.ts`.
 *
 * The real module uses pino with a `pino-pretty` transport, which runs in a
 * worker thread. That cannot be bundled into a single test file without extra
 * esbuild gymnastics, and logging is incidental infrastructure for these tests —
 * the business logic under test is unchanged.
 *
 * `NODE_ENV=production` would also avoid the transport, but it would flip the
 * session cookie to `secure` and every authenticated request over plain HTTP
 * would stop working. Stubbing is therefore the correct trade-off.
 *
 * The shape mimics pino closely enough for `pino-http`: it exposes the level
 * methods plus `child()`, which pino-http calls per request.
 */
type LogArgs = [Record<string, unknown> | string, string?];

function emit(level: string, args: LogArgs): void {
  const [first, second] = args;
  const bindings = typeof first === "string" ? {} : first;
  const message = typeof first === "string" ? first : second;
  const err = (bindings as { err?: unknown }).err;

  // Keep the test output readable: only warnings/errors carry useful signal.
  if (level === "warn" || level === "error" || level === "fatal") {
    const detail = err instanceof Error ? `: ${err.message}` : "";
    console.error(`[${level}] ${message ?? ""}${detail}`);
  }
}

function makeLogger(): Record<string, unknown> {
  const logger: Record<string, unknown> = {};
  for (const level of ["trace", "debug", "info", "warn", "error", "fatal"]) {
    logger[level] = (...args: unknown[]) => emit(level, args as LogArgs);
  }
  logger.child = () => makeLogger();
  logger.level = "silent";
  return logger;
}

export const logger = makeLogger();
