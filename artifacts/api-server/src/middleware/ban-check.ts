/**
 * Ban enforcement middleware.
 *
 * Runs after session initialization. For any Discord-authenticated session
 * (`req.session.userId`), it blocks non-safe HTTP methods (POST/PATCH/PUT/DELETE)
 * with a 403 when the player's `banned_until` is still in the future.
 *
 * Allowlist (always pass through):
 *   - GET / HEAD / OPTIONS  — read-only
 *   - POST /auth/logout     — players must be able to log out
 *   - /auth/discord*        — OAuth flow must complete regardless
 *
 * The check hits the DB directly (not the session cache) so that a ban applied
 * mid-session takes effect immediately on the next mutation.
 */

import { type Request, type Response, type NextFunction } from "express";
import { db, playersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

/** HTTP methods that can mutate state */
const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** Paths that must always be reachable even for banned accounts */
const ALWAYS_ALLOWED_PATHS = new Set([
  "/auth/logout",
  "/auth/discord",
  "/auth/discord/callback",
  "/auth/me",           // let client discover ban details
  "/healthz",
]);

export async function banCheck(req: Request, res: Response, next: NextFunction): Promise<void> {
  // Only applies to authenticated Discord sessions
  if (!req.session.userId) { next(); return; }

  // Safe methods — let them through
  if (!MUTATION_METHODS.has(req.method)) { next(); return; }

  // Explicitly allowed paths — let them through
  if (ALWAYS_ALLOWED_PATHS.has(req.path)) { next(); return; }

  const [row] = await db
    .select({
      bannedUntil: playersTable.bannedUntil,
      banReason:   playersTable.banReason,
      bannedBy:    playersTable.bannedBy,
    })
    .from(playersTable)
    .where(eq(playersTable.id, req.session.userId));

  if (row?.bannedUntil && new Date(row.bannedUntil) > new Date()) {
    res.status(403).json({
      error:       "Account suspended",
      code:        "BANNED",
      bannedUntil: row.bannedUntil.toISOString(),
      banReason:   row.banReason ?? null,
      bannedBy:    row.bannedBy  ?? null,
    });
    return;
  }

  next();
}
