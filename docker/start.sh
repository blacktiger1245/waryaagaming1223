#!/bin/sh
# Waryaa Gaming – container entrypoint
# Starts the Express API (background) then nginx (foreground).
# Nginx is PID 1's effective process; SIGTERM/SIGINT shut down both.
set -e

# Validate required secrets are present
if [ -z "$NEON_DATABASE_URL" ] && [ -z "$DATABASE_URL" ]; then
  echo "ERROR: NEON_DATABASE_URL (or DATABASE_URL) must be set" >&2
  exit 1
fi

if [ -z "$SESSION_SECRET" ]; then
  echo "WARNING: SESSION_SECRET is not set – using an insecure default" >&2
fi

# Start the Express API server in the background.
# Path must match the build-time location so pino's baked-in worker paths resolve.
PORT=5000 node --enable-source-maps /app/artifacts/api-server/dist/index.mjs &
NODE_PID=$!

# Do not let nginx accept traffic until the API is ready. Northflank can send
# the first browser requests immediately after the container starts; without
# this wait those requests reach nginx before Node is listening and return 502.
API_READY=0
for _ in $(seq 1 60); do
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
  echo "ERROR: API server did not become ready within 60 seconds" >&2
  exit 1
fi

# Graceful shutdown: forward signals to the node process
cleanup() {
  echo "Shutting down API server (PID $NODE_PID)..."
  kill "$NODE_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# Start nginx in the foreground (keeps the container alive)
exec nginx -g "daemon off;"
