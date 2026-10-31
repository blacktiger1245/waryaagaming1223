/**
 * Configuration check for the Stripe test → live switch.
 *
 * Asserts, without ever calling the Stripe API, creating a charge, or printing a
 * credential:
 *   • `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` survive the shapes hosts
 *     actually paste them in (surrounding quotes, padding, a stray CR)
 *   • `GET /api/webhooks/stripe` reports `mode: "live"` for a live key
 *   • the endpoint's own response never contains a credential value
 *
 * The status route is exercised over real HTTP through the real handler, so a
 * broken mount or a stale env read is caught. The runner sets a placeholder
 * `DATABASE_URL` when none is configured, because `@workspace/db` throws at
 * import time without one; that pool is constructed but never dialled and no
 * query is ever issued.
 *
 * Usage: node test/run-stripe-config-check.mjs
 */
import http from "node:http";
import express from "express";
import { stripeWebhookStatusHandler } from "../src/routes/payments";
import {
  getStripeMode,
  getStripeSecretKey,
  getStripeSecretKeyFingerprint,
  getStripeWebhookSecret,
  getStripeWebhookSecretFingerprint,
  isStripeConfigured,
} from "../src/lib/stripe";

// ── Tiny assertion harness (same shape as route-e2e.ts) ──────────────────────
let passed = 0;
const failures: string[] = [];

function check(name: string, condition: boolean, detail = ""): void {
  if (condition) {
    passed += 1;
    console.log(`PASS  ${name}${detail ? `  (${detail})` : ""}`);
  } else {
    failures.push(name);
    console.log(`FAIL  ${name}${detail ? `  (${detail})` : ""}`);
  }
}

function eq_(name: string, actual: unknown, expected: unknown): void {
  check(name, actual === expected, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

// ── Environment plumbing ─────────────────────────────────────────────────────

/** Run `fn` with the Stripe variables replaced, then restore the real values. */
function withStripeEnv(vars: Record<string, string>, fn: () => void): void {
  const names = ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"];
  const saved = names.map((name) => [name, process.env[name]] as const);

  for (const [name, value] of Object.entries(vars)) process.env[name] = value;

  try {
    fn();
  } finally {
    for (const [name, value] of saved) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

/** Render a fingerprint for the console — prefix and length, never the value. */
function fingerprintText(fingerprint: { prefix: string | null; length: number }): string {
  return `prefix=${fingerprint.prefix ?? "(unrecognised)"} length=${fingerprint.length}`;
}

// ── 1. Value normalisation (offline, no HTTP) ────────────────────────────────

function normalisationTests(): void {
  console.log("\n--- value normalisation (quotes, padding, stray CR) ---");

  withStripeEnv({ STRIPE_SECRET_KEY: '  "sk_live_example"  ' }, () => {
    eq_("double-quoted + padded key is normalised", getStripeSecretKey(), "sk_live_example");
    eq_("double-quoted + padded key still reports live", getStripeMode(), "live");
    eq_("double-quoted + padded key counts as configured", isStripeConfigured(), true);
  });

  withStripeEnv({ STRIPE_SECRET_KEY: "'rk_live_example'" }, () => {
    eq_("single-quoted restricted live key is normalised", getStripeSecretKey(), "rk_live_example");
    eq_("restricted live key reports live", getStripeMode(), "live");
  });

  withStripeEnv({ STRIPE_SECRET_KEY: "sk_test_example\r\n" }, () => {
    eq_("a trailing CR/LF is stripped from the key", getStripeSecretKey(), "sk_test_example");
    eq_("a test key still reports test", getStripeMode(), "test");
  });

  withStripeEnv({ STRIPE_SECRET_KEY: '"sk_live_unbalanced' }, () => {
    eq_("an unmatched quote is left untouched", getStripeSecretKey(), '"sk_live_unbalanced');
    eq_("an unmatched quote reports unknown", getStripeMode(), "unknown");
  });

  withStripeEnv({ STRIPE_SECRET_KEY: "   " }, () => {
    eq_("a whitespace-only key is not configured", isStripeConfigured(), false);
    eq_("a whitespace-only key reports unknown", getStripeMode(), "unknown");
    eq_(
      "a whitespace-only key has an empty fingerprint",
      fingerprintText(getStripeSecretKeyFingerprint()),
      "prefix=(unrecognised) length=0",
    );
  });

  withStripeEnv({ STRIPE_WEBHOOK_SECRET: '  "whsec_example"  ' }, () => {
    eq_("quoted + padded webhook secret is normalised", getStripeWebhookSecret(), "whsec_example");
    eq_(
      "the webhook fingerprint reports the public prefix",
      fingerprintText(getStripeWebhookSecretFingerprint()),
      "prefix=whsec_ length=13",
    );
  });
}

// ── 2. The live configuration, over real HTTP ────────────────────────────────

/** Serve the real status handler at the same path app.ts mounts it on. */
async function startServer(): Promise<{ server: http.Server; baseUrl: string }> {
  const app = express();
  app.get("/api/webhooks/stripe", stripeWebhookStatusHandler);

  const server = await new Promise<http.Server>((resolve) => {
    const listening = app.listen(0, () => resolve(listening));
  });

  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  return { server, baseUrl: `http://127.0.0.1:${port}` };
}

async function liveConfigurationTests(): Promise<void> {
  console.log("\n--- GET /api/webhooks/stripe with the configured environment ---");

  const secretKey = getStripeSecretKey();
  const webhookSecret = getStripeWebhookSecret();
  const keyFingerprint = getStripeSecretKeyFingerprint();
  const webhookFingerprint = getStripeWebhookSecretFingerprint();

  // Prefix + length only — never the credential itself.
  console.log(`  STRIPE_SECRET_KEY      ${fingerprintText(keyFingerprint)}`);
  console.log(`  STRIPE_WEBHOOK_SECRET  ${fingerprintText(webhookFingerprint)}`);

  if (!secretKey) {
    check(
      "STRIPE_SECRET_KEY is visible to the process",
      false,
      "add it to .env (or set it as a host secret) before running this check",
    );
    return;
  }

  const { server, baseUrl } = await startServer();
  let status = 0;
  let rawBody = "";
  try {
    const res = await fetch(`${baseUrl}/api/webhooks/stripe`);
    status = res.status;
    rawBody = await res.text();
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }

  eq_("the status endpoint answers 200", status, 200);

  const body = JSON.parse(rawBody) as {
    configured?: { stripeSecretKey?: boolean; webhookSecret?: boolean; mode?: string };
    fingerprints?: {
      stripeSecretKey?: { prefix: string | null; length: number };
      webhookSecret?: { prefix: string | null; length: number };
    };
  };

  eq_('GET /api/webhooks/stripe reports mode "live"', body.configured?.mode, "live");
  eq_("the endpoint can see the secret key", body.configured?.stripeSecretKey, true);
  eq_("the endpoint can see the webhook secret", body.configured?.webhookSecret, true);

  eq_(
    "the fingerprint reports the live secret key prefix",
    body.fingerprints?.stripeSecretKey?.prefix,
    "sk_live_",
  );
  eq_(
    "the fingerprint reports the real secret key length",
    body.fingerprints?.stripeSecretKey?.length,
    secretKey.length,
  );
  eq_(
    "the fingerprint reports the webhook secret prefix",
    body.fingerprints?.webhookSecret?.prefix,
    "whsec_",
  );
  eq_(
    "the fingerprint reports the real webhook secret length",
    body.fingerprints?.webhookSecret?.length,
    webhookSecret?.length ?? 0,
  );

  check(
    "no test-mode credential is loaded",
    keyFingerprint.prefix !== "sk_test_" && keyFingerprint.prefix !== "rk_test_",
    `mode=${body.configured?.mode}`,
  );
  check("the secret key never appears in the response", !rawBody.includes(secretKey));
  if (webhookSecret) {
    check("the webhook secret never appears in the response", !rawBody.includes(webhookSecret));
  }
}

// ── Entry point ──────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("=== STRIPE CONFIGURATION CHECK (offline — no Stripe API call, no charge) ===");

  normalisationTests();
  await liveConfigurationTests();

  console.log(`\n=== RESULT: ${passed} passed, ${failures.length} failed ===`);
  if (failures.length) {
    for (const f of failures) console.log(`  FAILED: ${f}`);
    process.exitCode = 1;
  }
}

try {
  await main();
} catch (err) {
  console.error("\nSTRIPE CONFIG CHECK CRASHED:", err);
  process.exitCode = 1;
}
