import app from "./app";
import { logger } from "./lib/logger";
import { ensureMatchBracketSchema, ensureAcademySchema, ensureShopSchema, ensureClanSchema, ensureClanTournamentSchema, ensurePlayerGameStatsSchema, ensureMatchResultSchema } from "./lib/ensure-schema";
import { activateUpcomingTournaments } from "./lib/tournament-scheduler";

// Replit's API artifact workflow supplies PORT=5000. Keep the same default
// for direct `pnpm run dev` usage so the server does not fail before startup.
const rawPort = process.env["PORT"] ?? "5000";

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

/**
 * Startup environment diagnostic.
 *
 * Reports which expected environment variables the RUNNING process can actually
 * see, so a host-level configuration problem (variable not linked to the
 * service, defined in the wrong environment, or set to a blank value) becomes
 * obvious in the deploy log within seconds instead of surfacing later as an
 * unrelated runtime error such as "Discord login is not configured yet".
 *
 * Only presence is reported — values are NEVER logged.
 *
 * Important: routes/auth.ts reads DISCORD_CLIENT_ID / DISCORD_CLIENT_SECRET
 * once at module load, so anything reported as unset/empty here cannot be fixed
 * without a redeploy.
 */
const DIAGNOSTIC_ENV_VARS: readonly string[] = [
  // Discord OAuth (routes/auth.ts)
  "DISCORD_CLIENT_ID",
  "DISCORD_CLIENT_SECRET",
  "BASE_URL",
  // Sessions + CORS (app.ts)
  "SESSION_SECRET",
  "FRONTEND_ORIGINS",
  // Database (app.ts, lib/db)
  "NEON_DATABASE_URL",
  "DATABASE_URL",
  // Object storage (lib/objectStorage.ts)
  "R2_ENDPOINT",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET_NAME",
];

function logEnvironmentStatus(): void {
  const set: string[] = [];
  const unset: string[] = [];
  const empty: string[] = [];
  const whitespaceOnly: string[] = [];

  for (const name of DIAGNOSTIC_ENV_VARS) {
    const value = process.env[name];

    if (value === undefined) {
      unset.push(name);
    } else if (value === "") {
      // Falsy — guards such as `if (!DISCORD_CLIENT_ID)` will fire and redirect
      // to /login?error=oauth_not_configured.
      empty.push(name);
    } else if (value.trim() === "") {
      // Truthy, so the guard passes, but the value is almost certainly a typo.
      whitespaceOnly.push(name);
    } else {
      set.push(name);
    }
  }

  logger.info(
    {
      set,
      unset,
      empty,
      whitespaceOnly,
      nodeEnv: process.env["NODE_ENV"] ?? null,
      apiBasePath: process.env["API_BASE_PATH"] ?? "(default /api)",
      port,
    },
    "Environment check (names only — no values logged)",
  );

  if (unset.length > 0 || empty.length > 0) {
    logger.warn(
      { unset, empty },
      "Environment variables missing or blank — features depending on them are disabled",
    );
  }
}

async function main() {
  logEnvironmentStatus();

  // Apply additive bracket schema patches (guarded, idempotent) before the
  // server accepts requests so match generation can persist stage + links.
  await ensureMatchBracketSchema();
  await ensureAcademySchema();
  await ensureShopSchema();
  await ensureClanSchema();
  await ensureClanTournamentSchema();
  await ensurePlayerGameStatsSchema();
  await ensureMatchResultSchema();

  // Auto-activate upcoming tournaments whose start date has been reached.
  // Runs on boot and then every 5 minutes while the server is alive.
  activateUpcomingTournaments().catch((err) => logger.warn({ err }, "Initial tournament activation check failed"));
  setInterval(() => {
    activateUpcomingTournaments().catch((err) => logger.warn({ err }, "Periodic tournament activation check failed"));
  }, 5 * 60 * 1000);

  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }

    logger.info({ port }, "Server listening");
  });
}

main().catch((err) => {
  logger.error({ err }, "Fatal error during server startup");
  process.exit(1);
});
