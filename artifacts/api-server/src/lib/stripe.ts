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

/**
 * Read an environment variable in the shape hosts actually provide it.
 *
 * Secrets are pasted by hand into `.env` files, host dashboards and secret
 * stores, so a value can easily arrive wrapped in quotes, padded with spaces,
 * or with a stray carriage return from a Windows editor. Any of those makes
 * `startsWith("sk_live_")` fail (the reported mode then becomes `unknown`) or
 * makes Stripe reject the credential, so surrounding whitespace and ONE layer of
 * matching quotes are removed before the value is used. Only surrounding
 * characters are touched — the secret itself is never altered.
 *
 * Returns `null` for an unset or effectively empty value, so callers treat
 * "not configured" and "configured with blanks" identically.
 */
function readEnvValue(name: string): string | null {
  const raw = process.env[name];
  if (raw === undefined) return null;

  let value = raw.trim();
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      value = value.slice(1, -1).trim();
    }
  }

  return value === "" ? null : value;
}

/** The normalised secret key used for Checkout, or `null` when not set. */
export function getStripeSecretKey(): string | null {
  return readEnvValue("STRIPE_SECRET_KEY");
}

/** True when `STRIPE_SECRET_KEY` is set, i.e. card checkout can be offered. */
export function isStripeConfigured(): boolean {
  return getStripeSecretKey() !== null;
}

/** Lazily construct the Stripe client so the API still boots without Stripe. */
export function getStripe(): Stripe {
  const secretKey = getStripeSecretKey();
  if (!secretKey) {
    throw new Error("Stripe is not configured: set STRIPE_SECRET_KEY");
  }

  if (!cachedClient) {
    cachedClient = new Stripe(secretKey);
    logger.info({ mode: getStripeMode() }, "Stripe client initialised");
  }

  return cachedClient;
}

/** Signing secret used to verify incoming webhook payloads, if configured. */
export function getStripeWebhookSecret(): string | null {
  return readEnvValue("STRIPE_WEBHOOK_SECRET");
}

/**
 * Mode of the configured secret key, derived from its prefix.
 *
 * `unknown` means the key is not a recognisable test/live key, and callers must
 * then make no assumption about the mode. Restricted keys (`rk_live_…` /
 * `rk_test_…`) are classified exactly like secret keys.
 *
 * Read from `process.env` at call time — through `readEnvValue`, so quotes or
 * padding around a pasted key cannot silently turn the mode into `unknown` — so
 * a host that swaps test keys for live keys (and redeploys) is described
 * correctly.
 */
export function getStripeMode(): "live" | "test" | "unknown" {
  const secretKey = getStripeSecretKey() ?? "";
  if (secretKey.startsWith("sk_live_") || secretKey.startsWith("rk_live_")) return "live";
  if (secretKey.startsWith("sk_test_") || secretKey.startsWith("rk_test_")) return "test";
  return "unknown";
}

/**
 * Non-secret fingerprint of a configured credential.
 *
 * `prefix` is only ever one of Stripe's PUBLIC prefixes (`sk_live_`, `rk_test_`,
 * `whsec_`, …) — never a slice of the secret itself — so `GET
 * /api/webhooks/stripe` can answer "is this host really running the live key I
 * just set, or a placeholder?" without leaking anything. `length` separates a
 * full key from a truncated paste.
 */
export interface CredentialFingerprint {
  prefix: string | null;
  length: number;
}

function fingerprint(value: string | null, pattern: RegExp): CredentialFingerprint {
  if (!value) return { prefix: null, length: 0 };
  const match = pattern.exec(value);
  return { prefix: match?.[0] ?? null, length: value.length };
}

/** Fingerprint of `STRIPE_SECRET_KEY`, e.g. `{ prefix: "sk_live_", length: 107 }`. */
export function getStripeSecretKeyFingerprint(): CredentialFingerprint {
  return fingerprint(getStripeSecretKey(), /^(?:sk|rk)_(?:live|test)_/);
}

/** Fingerprint of `STRIPE_WEBHOOK_SECRET`, e.g. `{ prefix: "whsec_", length: 38 }`. */
export function getStripeWebhookSecretFingerprint(): CredentialFingerprint {
  return fingerprint(getStripeWebhookSecret(), /^whsec_/);
}
