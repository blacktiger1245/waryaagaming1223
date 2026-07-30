# syntax=docker/dockerfile:1
# ─────────────────────────────────────────────────────────────────────────────
# Waryaa Gaming Platform
# Node.js 24 · pnpm 10 · Express API + React/Vite SPA · PostgreSQL (Neon)
#
# Runtime environment variables (set in Back4App → App Settings → Env Vars):
#   NEON_DATABASE_URL   – Neon Postgres connection string (required)
#   SESSION_SECRET      – random string for session signing  (required)
#
# Build arg (optional – only needed if app is served under a sub-path):
#   BASE_PATH           – default "/"
# ─────────────────────────────────────────────────────────────────────────────

# ══════════════════════════════════════════════════════════════════════════════
# STAGE 1 — install all workspace dependencies
# ══════════════════════════════════════════════════════════════════════════════
FROM node:24-alpine AS deps

# Install pnpm globally (same version as used in development)
RUN npm install -g pnpm@10.26.1

WORKDIR /app

# ── Copy every package.json first so Docker layer cache stays valid
#    until a manifest actually changes (not just source files).

# Root workspace manifests + shared TypeScript config
COPY package.json          ./
COPY pnpm-lock.yaml        ./
COPY pnpm-workspace.yaml   ./
COPY tsconfig.base.json    ./
COPY tsconfig.json         ./

# Library packages
COPY lib/api-client-react/package.json   lib/api-client-react/
COPY lib/api-spec/package.json           lib/api-spec/
COPY lib/api-zod/package.json            lib/api-zod/
COPY lib/db/package.json                 lib/db/
COPY lib/object-storage-web/package.json lib/object-storage-web/

# Artifact packages
COPY artifacts/api-server/package.json    artifacts/api-server/
COPY artifacts/wg-platform/package.json   artifacts/wg-platform/
COPY artifacts/mockup-sandbox/package.json artifacts/mockup-sandbox/

# Scripts workspace package
COPY scripts/package.json  scripts/

# ── Install all dependencies (dev + prod) using the exact locked versions
RUN pnpm install --frozen-lockfile

# ══════════════════════════════════════════════════════════════════════════════
# STAGE 2 — build the Express API server
# ══════════════════════════════════════════════════════════════════════════════
FROM deps AS build-api

# Copy shared library source (workspace deps of the API)
COPY lib/api-zod/     lib/api-zod/
COPY lib/db/          lib/db/

# Copy API server source
COPY artifacts/api-server/ artifacts/api-server/

# esbuild bundles everything into artifacts/api-server/dist/
RUN pnpm --filter @workspace/api-server run build

# ══════════════════════════════════════════════════════════════════════════════
# STAGE 3 — collect production-only node_modules for the API
# ══════════════════════════════════════════════════════════════════════════════
FROM build-api AS api-prod-deps

# Copy remaining workspace source (needed for pnpm deploy to resolve graph)
COPY lib/   lib/
COPY artifacts/wg-platform/package.json  artifacts/wg-platform/
COPY artifacts/mockup-sandbox/package.json artifacts/mockup-sandbox/
COPY scripts/ scripts/

# pnpm deploy creates a self-contained directory with only production deps,
# resolving all workspace symlinks so the result is portable.
RUN pnpm deploy --filter @workspace/api-server --prod --legacy /prod/api

# ══════════════════════════════════════════════════════════════════════════════
# STAGE 4 — build the React frontend (Vite)
# ══════════════════════════════════════════════════════════════════════════════
FROM deps AS build-web

ARG BASE_PATH=/
ENV BASE_PATH=${BASE_PATH}

# Port is required by vite.config.ts at build time (not used for listening)
ENV PORT=3000

# Copy shared library source used by the frontend
COPY lib/api-client-react/ lib/api-client-react/
COPY lib/api-spec/         lib/api-spec/
COPY lib/api-zod/          lib/api-zod/
COPY lib/object-storage-web/ lib/object-storage-web/

# Copy frontend source
COPY artifacts/wg-platform/ artifacts/wg-platform/

# Vite outputs static files to artifacts/wg-platform/dist/public/
RUN pnpm --filter @workspace/wg-platform run build

# ══════════════════════════════════════════════════════════════════════════════
# STAGE 5 — production image
# Runs nginx (port 80) serving the SPA and proxying /api/* to Node on :5000
# ══════════════════════════════════════════════════════════════════════════════
FROM nginx:1.27-alpine

# Add Node.js runtime for the Express API server
RUN apk add --no-cache nodejs

# ── API server ─────────────────────────────────────────────────────────────
WORKDIR /app/api

# Self-contained esbuild bundle (index.mjs + pino worker threads)
COPY --from=build-api    /app/artifacts/api-server/dist      ./dist

# Production node_modules (contains @google-cloud/storage and other externals
# that esbuild intentionally left unbundled)
COPY --from=api-prod-deps /prod/api/node_modules             ./node_modules

# ── React SPA ──────────────────────────────────────────────────────────────
COPY --from=build-web /app/artifacts/wg-platform/dist/public /usr/share/nginx/html

# ── nginx configuration ────────────────────────────────────────────────────
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf

# ── Container entrypoint ───────────────────────────────────────────────────
COPY docker/start.sh /start.sh
RUN chmod +x /start.sh

# nginx listens on 80; the API is on 5000 (internal only)
EXPOSE 80

CMD ["/start.sh"]
