import { type Request, type Response, type NextFunction } from "express";
import { getReadiness } from "../lib/readiness";

/**
 * The readiness probe path must stay reachable while the application is still
 * initializing so it can report the live readiness state. Both forms are listed
 * because the API can be mounted under a prefix (default "/api") or at the root
 * (API_BASE_PATH="").
 */
const ALWAYS_REACHABLE = new Set(["/api/healthz", "/healthz"]);

/**
 * Keeps normal application traffic at 503 until startup initialization has
 * completed successfully, so no request is served as "ready" before the
 * database schema bootstrap has finished.
 *
 * 503 + Retry-After is the correct signal here: the process is up and the port
 * is open, it is simply not ready to serve yet (contrast with a 502, which means
 * nothing was listening at all).
 */
export function readinessGate(req: Request, res: Response, next: NextFunction): void {
  if (ALWAYS_REACHABLE.has(req.path)) {
    next();
    return;
  }

  const readiness = getReadiness();
  if (readiness.state === "ready") {
    next();
    return;
  }

  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Retry-After", "5");

  if (readiness.state === "failed") {
    res.status(503).json({
      error: "Service unavailable",
      status: "unavailable",
      reason: "startup_failed",
    });
    return;
  }

  res.status(503).json({
    error: "Service is starting up",
    status: "starting",
  });
}
