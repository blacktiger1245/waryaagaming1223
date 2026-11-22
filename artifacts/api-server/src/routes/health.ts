import { Router, type IRouter } from "express";
import { getReadiness } from "../lib/readiness";

const router: IRouter = Router();

/**
 * Readiness / health endpoint.
 *
 *  503 "starting"    — the process is up and the port is open, but required
 *                      startup initialization (database schema bootstrap) is
 *                      still running. The reverse proxy can connect, so this is
 *                      a normal 503 (not a 502 connection-refused).
 *  503 "unavailable" — startup initialization did not complete successfully.
 *  200 "ok"          — everything required for serving traffic is initialized.
 *
 * Deliberately does NOT touch the database, so it stays answerable even when the
 * database is slow or unreachable.
 */
router.get("/healthz", (_req, res) => {
  const readiness = getReadiness();

  res.setHeader("Cache-Control", "no-store");

  if (readiness.state === "ready") {
    res.status(200).json({ status: "ok", ready: true });
    return;
  }

  if (readiness.state === "failed") {
    res.status(503).json({
      status: "unavailable",
      ready: false,
      reason: "startup_failed",
      stage: readiness.failedStage,
    });
    return;
  }

  res.setHeader("Retry-After", "5");
  res.status(503).json({ status: "starting", ready: false });
});

export default router;

