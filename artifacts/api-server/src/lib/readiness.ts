/**
 * Explicit application readiness state.
 *
 * The HTTP listener opens as soon as the process boots so the reverse proxy can
 * always connect to the port, but the application is NOT "ready" until every
 * required startup task (the additive database schema bootstrap) has completed
 * successfully. /api/healthz reports this state, and the readiness gate keeps
 * normal traffic at 503 until it flips to "ready".
 *
 * This module has NO database dependency, so the health route can always read it
 * even when the database is slow or unreachable.
 */

export type ReadinessState = "starting" | "ready" | "failed";

export interface ReadinessStage {
  name: string;
  ok: boolean;
  durationMs: number;
}

export interface ReadinessSnapshot {
  state: ReadinessState;
  ready: boolean;
  startedAt: string;
  readyAt: string | null;
  durationMs: number | null;
  stages: ReadinessStage[];
  failedStage: string | null;
}

const startedAt = Date.now();

let state: ReadinessState = "starting";
let readyAt: number | null = null;
let failedStage: string | null = null;
const stages: ReadinessStage[] = [];

export function recordStage(name: string, ok: boolean, durationMs: number): void {
  stages.push({ name, ok, durationMs: Math.max(0, Math.round(durationMs)) });
}

/** Marks the application ready. Idempotent; never downgrades a ready app. */
export function markReady(): void {
  if (state === "ready") return;
  state = "ready";
  readyAt = Date.now();
}

/**
 * Marks startup initialization as failed. A no-op once the app is ready, so a
 * transient database error later in the process's life does not take the
 * service out of rotation.
 */
export function markFailed(stage: string): void {
  if (state === "ready") return;
  state = "failed";
  failedStage = stage;
}

export function isReady(): boolean {
  return state === "ready";
}

export function getReadiness(): ReadinessSnapshot {
  return {
    state,
    ready: state === "ready",
    startedAt: new Date(startedAt).toISOString(),
    readyAt: readyAt === null ? null : new Date(readyAt).toISOString(),
    durationMs: readyAt === null ? null : readyAt - startedAt,
    stages: [...stages],
    failedStage,
  };
}
