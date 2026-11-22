#!/bin/sh
# Waryaa Gaming – container entrypoint
# Starts the Express API, waits until it is genuinely READY (HTTP 200 on
# /api/healthz), then starts nginx and supervises BOTH processes so a crashed
# API (or nginx) can never leave a misleadingly "Running" container behind.
set -e

# Validate required secrets are present
if [ -z "$NEON_DATABASE_URL" ] && [ -z "$DATABASE_URL" ]; then
  echo "ERROR: NEON_DATABASE_URL (or DATABASE_URL) must be set" >&2
  exit 1
fi

if [ -z "$SESSION_SECRET" ]; then
  echo "WARNING: SESSION_SECRET is not set – using an insecure default" >&2
fi

NODE_PID=""
NGINX_PID=""

# Stop both children. Safe to call more than once (cleanup on EXIT + signal).
cleanup() {
  [ -n "$NGINX_PID" ] && kill "$NGINX_PID" 2>/dev/null || true
  [ -n "$NODE_PID" ] && kill "$NODE_PID" 2>/dev/null || true
  wait 2>/dev/null || true
}

# Signal handler: stop the children, then exit 0 so the platform sees a clean stop.
shutdown() {
  echo "Received shutdown signal — stopping API and nginx" >&2
  cleanup
  exit 0
}
trap cleanup EXIT
trap shutdown INT TERM

# ── Start the Express API in the background ─────────────────────────────────
# Path must match the build-time location so pino's baked-in worker paths resolve.
PORT=5000 node --enable-source-maps /app/artifacts/api-server/dist/index.mjs &
NODE_PID=$!

# ── Wait for genuine readiness ───────────────────────────────────────────────
# The API opens its port immediately but answers 503 on /api/healthz until the
# database schema bootstrap has completed, so a successful (2xx) probe here means
# the application is truly ready to serve traffic. 120 attempts ≈ 2 minutes;
# Northflank can send the first browser requests immediately after startup.
API_READY=0
for _ in $(seq 1 120); do
  if wget -q -O /dev/null http://127.0.0.1:5000/api/healthz; then
    API_READY=1
    break
  fi

  if ! kill -0 "$NODE_PID" 2>/dev/null; then
    echo "ERROR: API server exited before becoming ready" >&2
    exit 1
  fi

  sleep 1
done

if [ "$API_READY" -ne 1 ]; then
  echo "ERROR: API server did not become ready within 120 seconds" >&2
  exit 1
fi

# ── Start nginx in the background, then supervise both processes ─────────────
nginx -g "daemon off;" &
NGINX_PID=$!

# Poll until one of the two processes exits (1s so signal handling reacts fast).
while kill -0 "$NODE_PID" 2>/dev/null && kill -0 "$NGINX_PID" 2>/dev/null; do
  sleep 1
done

if ! kill -0 "$NODE_PID" 2>/dev/null; then
  echo "ERROR: API server exited — stopping container so Northflank restarts it" >&2
else
  echo "ERROR: nginx exited — stopping container so Northflank restarts it" >&2
fi

# Non-zero exit tears the container down; the platform starts a fresh, fully
# supervised instance instead of nginx fronting a dead API (502).
exit 1
