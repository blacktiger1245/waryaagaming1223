import app from "./app";
import { logger } from "./lib/logger";
import { ensureMatchBracketSchema } from "./lib/ensure-schema";

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
