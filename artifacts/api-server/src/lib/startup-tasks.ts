/**
 * Startup task result + database-error classification.
 *
 * The boot sequence must distinguish a TRANSIENT database connectivity problem
 * (worth retrying) from a PERMANENT SQL/schema error (retrying it three times
 * only delays the failure). This module owns that policy, plus the secret-safe
 * error formatting used in logs. It has no dependencies.
 */

/** Result of one required startup task. */
export type StartupTaskOutcome = { ok: true } | { ok: false; error: unknown };

/** Node.js/libuv errno values that indicate a transient connectivity problem. */
const TRANSIENT_ERRNO = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ECONNABORTED",
  "ETIMEDOUT",
  "EPIPE",
  "ENOTFOUND",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ENETDOWN",
  "EHOSTDOWN",
  "EAI_AGAIN",
]);

/** PostgreSQL SQLSTATE codes that are transient (connection / lock / temporary). */
const TRANSIENT_SQLSTATE = new Set([
  "08000", // connection_exception
  "08001", // sqlclient_unable_to_establish_sqlconnection
  "08003", // connection_does_not_exist
  "08004", // sqlserver_rejected_establishment_of_sqlconnection
  "08006", // connection_failure
  "08007", // transaction_resolution_unknown
  "40001", // serialization_failure
  "40P01", // deadlock_detected
  "53300", // too_many_connections
  "53400", // configuration_limit_exceeded
  "55P03", // lock_not_available
  "57014", // query_canceled (statement_timeout / query_timeout)
  "57P01", // admin_shutdown
  "57P02", // crash_shutdown
  "57P03", // cannot_connect_now
]);

/** Message patterns that only ever occur for connectivity/lifecycle problems. */
const TRANSIENT_MESSAGE = [
  /timeout exceeded when trying to connect/i,
  /connection terminated/i,
  /connection error/i,
  /is not queryable/i,
  /server closed the connection unexpectedly/i,
  /terminating connection/i,
  /the database system is starting up/i,
  /too many clients/i,
  /socket hang up/i,
  /getaddrinfo/i,
];

/** A well-formed 5-character SQLSTATE (e.g. 42P01, 23505, 08006). */
const SQLSTATE_RE = /^[0-9A-Z]{5}$/;

function errorCode(err: unknown): string | null {
  if (typeof err === "object" && err !== null) {
    const code = (err as { code?: unknown }).code;
    if (typeof code === "string" && code.length > 0) return code;
  }
  return null;
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "Unknown error";
}

/**
 * True when the failure is a transient connectivity/temporary condition worth
 * retrying.
 *
 * A well-formed SQLSTATE that is NOT in the transient list is a permanent
 * SQL/schema error (syntax error, undefined column, constraint violation, …)
 * and must not be retried.
 */
export function isTransientDbError(err: unknown): boolean {
  const code = errorCode(err);
  if (code && TRANSIENT_ERRNO.has(code)) return true;
  if (code && TRANSIENT_SQLSTATE.has(code)) return true;
  if (code && SQLSTATE_RE.test(code)) return false; // permanent SQL/schema error

  const message = errorMessage(err);
  return TRANSIENT_MESSAGE.some((re) => re.test(message));
}

/** Strip any connection-string credentials before a message reaches a log. */
export function sanitizeErrorMessage(message: string): string {
  const scrubbed = message.replace(/\/\/[^@\s/]+@/g, "//[redacted]@");
  return scrubbed.length > 200 ? `${scrubbed.slice(0, 200)}…` : scrubbed;
}

export interface DbErrorInfo {
  name: string;
  code: string | null;
  transient: boolean;
  message: string;
}

/** Secret-safe view of an error for logging (no DSN, no password). */
export function describeDbError(err: unknown): DbErrorInfo {
  return {
    name: err instanceof Error ? err.name : typeof err,
    code: errorCode(err),
    transient: isTransientDbError(err),
    message: sanitizeErrorMessage(errorMessage(err)),
  };
}
