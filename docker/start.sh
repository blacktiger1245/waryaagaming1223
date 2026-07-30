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

# Start the Express API server in the background
PORT=5000 node --enable-source-maps /app/api/dist/index.mjs &
NODE_PID=$!

# Graceful shutdown: forward signals to the node process
cleanup() {
  echo "Shutting down API server (PID $NODE_PID)..."
  kill "$NODE_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# Start nginx in the foreground (keeps the container alive)
exec nginx -g "daemon off;"
