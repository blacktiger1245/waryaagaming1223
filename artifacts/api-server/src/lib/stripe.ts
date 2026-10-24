import Stripe from "stripe";
import { logger } from "./logger";

/**
 * Stripe client + configuration for WG Coins purchases.
 *
 * The API server uses the secret key (`STRIPE_SECRET_KEY`) server-side only —
 * the browser never sees it. Hosted Stripe Checkout is used, so the buyer pays
 * on Stripe's own page and raw card data never reaches this server.
 *
 * Both helpers read `process.env` at call time (not at module load) so the
 * client is built from whatever the running host actually provides.
 */

let cachedClient: Stripe | null = null;

/** True when `STRIPE_SECRET_KEY` is set, i.e. card checkout can be offered. */
export function isStripeConfigured(): boolean {
  return Boolean(process.env["STRIPE_SECRET_KEY"]);
}

/** Lazily construct the Stripe client so the API still boots without Stripe. */
export function getStripe(): Stripe {
  const secretKey = process.env["STRIPE_SECRET_KEY"];
  if (!secretKey) {
    throw new Error("Stripe is not configured: set STRIPE_SECRET_KEY");
  }

  if (!cachedClient) {
    cachedClient = new Stripe(secretKey);
    logger.info("Stripe client initialised");
  }

  return cachedClient;
}

/** Signing secret used to verify incoming webhook payloads, if configured. */
export function getStripeWebhookSecret(): string | null {
  return process.env["STRIPE_WEBHOOK_SECRET"] || null;
}
