# Waryaa Gaming

Waryaa Gaming is the Esomali Sport Federation's official platform — tournaments, players, teams, rankings, news, and Discord-based login/admin, run as an imported pnpm monorepo.

## Run & Operate

- Artifacts (each has its own Replit-managed workflow, already running): `artifacts/api-server: API Server` (port 5000), `artifacts/wg-platform: web` (the site), `artifacts/mockup-sandbox: Component Preview Server`.
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string (already provisioned); `SESSION_SECRET` — signs session cookies (already set as a secret; the API falls back to an insecure default if unset, so keep it set in every environment)
- Storage env: `R2_ENDPOINT` and `R2_BUCKET_NAME` are set as shared env vars (bucket: `waryaagaming`, endpoint: Cloudflare R2 S3-compatible URL); `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY` are Replit Secrets — generate from Cloudflare dashboard → R2 → Manage R2 API Tokens
- Hosted frontend/API: the web build uses same-origin `/api` routing by default. If the frontend is hosted separately from the API, set the web build variable `VITE_API_URL` to the API origin (without a trailing slash), the API variable `FRONTEND_ORIGINS` to the exact frontend origin(s), comma-separated, and `COOKIE_SAME_SITE=none`. The API rejects credentialed requests from origins not matching the API origin or `FRONTEND_ORIGINS`.
- Stripe (WG Coins checkout): set `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` on the API server (see `.env.example`) and register a webhook endpoint at `<API origin>/api/webhooks/stripe` in the Stripe dashboard for `checkout.session.completed` and `checkout.session.async_payment_succeeded`. `STRIPE_WEBHOOK_SECRET` must be the signing secret of that exact endpoint (test and live endpoints have different secrets). `POST /api/payments/create-checkout-session` only returns a Checkout URL — WG Coins are credited exclusively by that signature-verified webhook. `GET /api/webhooks/stripe` describes the endpoint in a browser: it lists the handled event types and whether the running process can see `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET`, plus the mode (`test` / `live`) derived from the key prefix. Switching test → live means replacing exactly those two host values with the live ones and creating a live-mode webhook endpoint; there are no test Price/Product objects to recreate because Checkout is built from inline `price_data` off the server-side `COIN_PACKAGES` table, and `VITE_STRIPE_PUBLISHABLE_KEY` is read by nothing. A webhook event whose mode does not match the key is ignored with a `mode-mismatch` warning instead of being credited. `VITE_STRIPE_PUBLISHABLE_KEY` is only needed if you later switch from hosted Checkout (redirect) to embedded Checkout/Elements.
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
- Stripe webhook bodies must stay raw: `${API_PREFIX}/webhooks/stripe` is registered in `artifacts/api-server/src/app.ts` with `express.raw({ type: "application/json" })` BEFORE `express.json()`. Moving it below the JSON parser makes signature verification fail on every delivery.
- Coin top-ups are idempotent by construction: `coin_transactions.stripe_session_id` is unique, so a redelivered webhook can never credit the same Checkout Session twice (`ensureStripeSchema()` in `src/lib/ensure-schema.ts` keeps that column/index present at boot). This is also what keeps `checkout.session.completed` and the `payment_intent.succeeded` safety net from double-crediting one purchase.
- The buyer's purchase is confirmed by `GET /api/payments/checkout-session/:sessionId`, scoped to `req.session.userId`, rather than by watching the balance: the webhook can credit the coins before `/buy-coins` even renders, so comparing the balance against a snapshot taken on page load reports a false "still confirming". `/buy-coins` polls that endpoint for up to 30s after the redirect, then shows exactly one result toast ("WG Coins added" or "Still confirming") and cleans the `?checkout=…&session_id=…` query string out of the URL.
- The Stripe dashboard endpoint MUST be subscribed to `checkout.session.completed`. An endpoint subscribed to something else (for example only `payment_intent.succeeded`) delivers no event the handler can credit, so a paid Checkout Session silently leaves the balance untouched — the buyer sees "Payment received" and a balance of 0. `GET /api/webhooks/stripe` shows the handled event types and whether `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` are visible to the running process, and every webhook step logs to stdout with a `[stripe-webhook]` prefix.

## Product

Public site: home, tournaments, players, teams, rankings, news, media, live, WG Academy, partners, and marketplace. WG Academy and Partners currently show coming-soon pages. Discord login for visitors, plus an admin dashboard (`/admin`, login `black_tiger`) with full CRUD over players, teams, tournaments, matches, news, media, and hall of fame.

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
