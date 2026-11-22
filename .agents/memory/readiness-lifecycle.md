---
name: API readiness lifecycle (listener-first boot)
description: Why the API opens its port before the DB bootstrap, how /api/healthz readiness works, and how the container supervises Node + nginx.
---

The API server opens its HTTP listener **before** the database schema bootstrap and reports readiness separately from liveness.

- `src/index.ts` calls `app.listen()` first, then runs the 11 additive `ensure*Schema()` boot tasks, then `markReady()`.
- `src/lib/readiness.ts` holds the `starting | ready | failed` state (no DB dependency).
- `src/middleware/readiness-gate.ts` returns **503 + Retry-After** for normal traffic until the state is `ready`; `/api/healthz` is exempt and reports the live state.
- `src/routes/health.ts` returns **503** while starting/failed and **200 only when ready**.

**Why:** production returned `502 connect() failed (111) while connecting to upstream http://127.0.0.1:5000/api/healthz` because `app.listen()` was the last statement of `main()` — the port stayed closed for the whole DB bootstrap (11 sequential network DDL passes), so nginx/readiness probes hit a closed port. `pg`'s default `connectionTimeoutMillis: 0` (and a pool with no `error` listener) meant a stalled or unreachable DB could hang boot forever or crash the process, leaving nginx fronting a dead API.

**How to apply:** keep `app.listen()` before the boot tasks; never return 200 from `/api/healthz` before `markReady()`. `docker/start.sh` waits for a **2xx** healthz (not just a TCP connect) before starting nginx, then supervises both processes and exits non-zero if either dies — a crashed Node must take the container down so Northflank restarts it rather than leaving a "Running" container that 502s.

## Transient vs permanent startup retries

`src/lib/startup-tasks.ts` classifies a failure by errno / SQLSTATE: connectivity and temporary codes (`ECONNREFUSED`, `ETIMEDOUT`, `57P03`, `48001`, `40001`, `40P01`, `53300`, `57014`, …) are retried 3× with 2s backoff; a well-formed SQLSTATE that is not in that set (e.g. `42P01`, `42703`, `23505`, `42601`) is a permanent SQL/schema error and is **not** retried. Errors are logged with the stage name, SQLSTATE/errno and a credential-scrubbed message — never the connection string.
