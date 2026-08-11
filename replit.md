# Waryaa Gaming

Waryaa Gaming is the Somali eSports Federation's official platform — tournaments, players, teams, rankings, news, and Discord-based login/admin, run as an imported pnpm monorepo.

## Run & Operate

- Artifacts (each has its own Replit-managed workflow, already running): `artifacts/api-server: API Server` (port 5000), `artifacts/wg-platform: web` (the site), `artifacts/mockup-sandbox: Component Preview Server`.
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string (already provisioned); `SESSION_SECRET` — signs session cookies (already set as a secret; the API falls back to an insecure default if unset, so keep it set in every environment)
- Storage env: `R2_ENDPOINT` and `R2_BUCKET_NAME` are set as shared env vars (bucket: `waryaagaming`, endpoint: Cloudflare R2 S3-compatible URL); `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY` are Replit Secrets — generate from Cloudflare dashboard → R2 → Manage R2 API Tokens
- Hosted frontend/API: the web build uses same-origin `/api` routing by default. If the frontend is hosted separately from the API, set the web build variable `VITE_API_URL` to the API origin (without a trailing slash), the API variable `FRONTEND_ORIGINS` to the exact frontend origin(s), comma-separated, and `COOKIE_SAME_SITE=none`. The API rejects credentialed requests from origins not matching the API origin or `FRONTEND_ORIGINS`.
- Tournament owners can create tournaments from `/tournaments`, add Discord-registered tournament admins from the tournament detail page, and manage that tournament's staff without global admin access.
- Discord onboarding includes a free-agent opt-in. Opted-in players with no team appear in `/marketplace`; coaches can add them to a team, and roster changes automatically remove them from the marketplace.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5, session auth via `connect-pg-simple` + Discord OAuth
- DB: PostgreSQL + Drizzle ORM
- Web: Vite + React (`artifacts/wg-platform`)
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/api-server` — Express API (routes in `src/routes`, session/auth setup in `src/app.ts`)
- `artifacts/wg-platform` — the public site (React/Vite)
- `artifacts/mockup-sandbox` — component preview sandbox for canvas mockups
- `lib/db` — Drizzle schema + migrations (`pnpm --filter @workspace/db run push`)

## Architecture decisions

- Sessions use a manually-created `user_sessions` Postgres table with `createTableIfMissing: false` — see Gotchas.

## Product

Public site: home, tournaments, players, teams, rankings, news, media, live, WG academy, partners, marketplace. Discord login for visitors, plus an admin dashboard (`/admin`, login `black_tiger`) with full CRUD over players, teams, tournaments, matches, news, media, and hall of fame.

## Branding

- Logo: `artifacts/wg-platform/public/logo.jpg` (the WG mark), used in the site header/sidebar, admin sidebar, and favicon.
- Site name is always shown in full as "Waryaa Gaming" (not just "Waryaa") in header/sidebar/footer.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- The API server bundles with esbuild, which doesn't copy `connect-pg-simple`'s `table.sql` asset, so `createTableIfMissing` fails silently at runtime. The `user_sessions` table is created manually in Postgres and `createTableIfMissing` is set to `false` in `src/app.ts` — don't re-enable it.
- The legacy `API Server` / `Waryaa Gaming` workflows (from before artifact registration) hardcode the same ports as the real `artifacts/api-server: API Server` / `artifacts/wg-platform: web` workflows and will always fail with EADDRINUSE if run — that's expected; ignore them and use the `artifacts/...` workflows.
- DB tables exist but are empty (no seed data) — expect empty lists from list endpoints until data is added.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
