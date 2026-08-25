import app from "./app";
import { logger } from "./lib/logger";
import { ensureMatchBracketSchema } from "./lib/ensure-schema";
import { activateUpcomingTournaments } from "./lib/tournament-scheduler";

// Replit's API artifact workflow supplies PORT=5000. Keep the same default
// for direct `pnpm run dev` usage so the server does not fail before startup.
const rawPort = process.env["PORT"] ?? "5000";

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function main() {
  // Apply additive bracket schema patches (guarded, idempotent) before the
  // server accepts requests so match generation can persist stage + links.
  await ensureMatchBracketSchema();

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
