import { Router, type Request, type Response } from "express";
import type Stripe from "stripe";
import { db, coinTransactionsTable, playersTable } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import { COIN_PACKAGES } from "./coins";
import { getStripe, getStripeMode, getStripeWebhookSecret, isStripeConfigured } from "../lib/stripe";
import { logger } from "../lib/logger";

const router = Router();

/**
 * Stripe event types this endpoint fulfils.
 *
 * `checkout.session.completed` is the one the Stripe Dashboard webhook endpoint
 * MUST be subscribed to. An endpoint subscribed to anything else (for example
 * only `payment_intent.succeeded`) delivers no event this handler can credit,
 * which looks exactly like "the payment succeeded but no WG Coins arrived".
 *
 * `checkout.session.async_payment_succeeded` covers delayed payment methods,
 * and `payment_intent.succeeded` is handled as a safety net for endpoints that
 * are subscribed to it instead of the Checkout events — the handler looks the
 * Checkout Session up from the payment intent, so a dashboard misconfiguration
 * cannot silently swallow a paid purchase.
 */
export const STRIPE_WEBHOOK_EVENT_TYPES = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "payment_intent.succeeded",
] as const;

/** Prefix on every webhook log line, so the flow is easy to grep in host logs. */
const WEBHOOK_LOG = "[stripe-webhook]";

/** Where Stripe sends the buyer back to after checkout. */
const CHECKOUT_RETURN_PATH = "/buy-coins";

/**
 * Origin (scheme + host, no trailing slash) of the SPA, used to build Stripe's
 * success/cancel URLs. Prefers the origins this deployment already documents
 * (`FRONTEND_ORIGINS`, then `BASE_URL`) and falls back to the origin the
 * checkout request arrived on, so it works on Replit and on split
 * frontend/API hosts alike.
 */
function resolveFrontendOrigin(req: Request): string {
  const firstConfiguredOrigin = (process.env["FRONTEND_ORIGINS"] ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)[0];

  for (const candidate of [firstConfiguredOrigin, process.env["BASE_URL"]]) {
    if (!candidate) continue;
    try {
      return new URL(candidate).origin;
    } catch {
      // Malformed value — try the next source instead of failing the request.
    }
  }

  const forwardedProto = (req.headers["x-forwarded-proto"] as string | undefined)?.split(",")[0]?.trim();
  const protocol = forwardedProto ?? req.protocol;
  const forwardedHost = (req.headers["x-forwarded-host"] as string | undefined)?.split(",")[0]?.trim();
  const host = forwardedHost ?? req.get("host");
  return host ? `${protocol}://${host}` : "";
}

// ── POST /payments/create-checkout-session ───────────────────────────────────
// Starts a hosted Stripe Checkout Session for a WG Coins package and returns
// the URL the browser should be redirected to. Coins are only credited once
// Stripe confirms the payment through the webhook below, so an abandoned or
// failed payment never changes a balance.
router.post("/payments/create-checkout-session", async (req: Request, res: Response) => {
  const me = req.session?.userId;
  if (!me) {
    res.status(401).json({ error: "Login required" });
    return;
  }

  if (!isStripeConfigured()) {
    res.status(503).json({ error: "Card payments are not configured yet" });
    return;
  }

  const body = (req.body ?? {}) as { packageId?: unknown };
  const packageId = typeof body.packageId === "string" ? body.packageId : "";
  const pkg = COIN_PACKAGES.find((p) => p.id === packageId);
  if (!pkg) {
    res.status(400).json({ error: "Invalid coin package" });
    return;
  }

  const origin = resolveFrontendOrigin(req);

  try {
    const session = await getStripe().checkout.sessions.create({
      mode: "payment",
      client_reference_id: String(me),
      // Metadata is echoed back on the webhook, so the account that gets
      // credited and the package that was bought are decided here — never by
      // the browser.
      // `userId` is the canonical key the webhook reads (with `playerId` kept
      // for sessions created before it was renamed); `coins` mirrors the
      // server-side package amount so the ledger row can be cross-checked.
      metadata: {
        userId: String(me),
        playerId: String(me),
        packageId: pkg.id,
        coins: String(pkg.coins),
      },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: pkg.priceUsd * 100,
            product_data: {
              name: `${pkg.coins / 1_000_000}M WG Coins`,
              description: `Top-up of ${pkg.coins.toLocaleString("en-US")} WG Coins`,
            },
          },
        },
      ],
      success_url: `${origin}${CHECKOUT_RETURN_PATH}?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}${CHECKOUT_RETURN_PATH}?checkout=cancelled`,
    });

    if (!session.url) {
      logger.error({ sessionId: session.id }, "Stripe checkout session has no redirect URL");
      res.status(502).json({ error: "Stripe did not return a checkout URL" });
      return;
    }

    res.json({ url: session.url, sessionId: session.id });
  } catch (err) {
    logger.error({ err, packageId: pkg.id }, "Could not create Stripe checkout session");
    res.status(502).json({ error: "Could not start checkout. Please try again." });
  }
});

// ── GET /payments/checkout-session/:sessionId ────────────────────────────────
// Reports whether one Stripe Checkout Session has already been credited to the
// signed-in player. `/buy-coins` polls this after returning from Checkout, so a
// purchase is confirmed by the session it paid for instead of by comparing the
// balance against a snapshot taken when the page loaded — the webhook may
// already have credited the coins before the page even renders, which made the
// old balance comparison report a false "still confirming".
//
// Scoped to the caller: the ledger row has to belong to `req.session.userId`,
// so another player's session id just reports `credited: false` and reveals
// nothing about their purchase. Read-only and idempotent.
router.get("/payments/checkout-session/:sessionId", async (req: Request, res: Response) => {
  const me = req.session?.userId;
  if (!me) {
    res.status(401).json({ error: "Login required" });
    return;
  }

  const rawSessionId = req.params.sessionId;
  const sessionId = typeof rawSessionId === "string" ? rawSessionId : "";
  if (!sessionId.startsWith("cs_")) {
    res.status(400).json({ error: "Invalid Checkout Session id" });
    return;
  }

  const [credited] = await db
    .select({
      coins: coinTransactionsTable.coins,
      packageId: coinTransactionsTable.packageId,
      creditedAt: coinTransactionsTable.createdAt,
    })
    .from(coinTransactionsTable)
    .where(
      and(
        eq(coinTransactionsTable.stripeSessionId, sessionId),
        eq(coinTransactionsTable.playerId, me),
      ),
    );

  if (!credited) {
    res.json({ sessionId, credited: false });
    return;
  }

  // The balance is read from the same server the webhook updated, so the client
  // never has to infer it.
  const [player] = await db
    .select({ coinBalance: playersTable.coinBalance })
    .from(playersTable)
    .where(eq(playersTable.id, me));

  res.json({
    sessionId,
    credited: true,
    coins: credited.coins,
    packageId: credited.packageId,
    creditedAt: credited.creditedAt?.toISOString() ?? null,
    balance: player?.coinBalance ?? null,
  });
});

/**
 * Outcome of trying to fulfil one Checkout Session.
 *
 * `ignored` means the event was not for us at all (for example a Payment Link
 * in the same Stripe account) and is answered with 200 so Stripe stops
 * retrying. `invalid` means the session was created by this app but its
 * metadata is unusable — that is a bug on our side, so it is answered with a
 * non-2xx to make the failed delivery visible in the Stripe Dashboard instead
 * of silently dropping a paid purchase.
 */
type FulfilResult =
  | { status: "credited"; playerId: number; coins: number; balance: number }
  | { status: "already-credited"; playerId: number }
  | { status: "ignored"; reason: string }
  | { status: "invalid"; reason: string };

/**
 * Resolves the WG Coins package a Checkout Session paid for.
 *
 * The amount is always taken from the server-side COIN_PACKAGES table: the
 * browser only ever sends a package id, and `metadata.coins` is used solely to
 * match a package this app actually sells — never as a free-form amount.
 */
function resolvePackage(
  metadata: Record<string, string> | null | undefined,
): (typeof COIN_PACKAGES)[number] | null {
  const byId = COIN_PACKAGES.find((p) => p.id === metadata?.["packageId"]);
  if (byId) return byId;

  const coinsFromMetadata = Number(metadata?.["coins"]);
  if (!Number.isFinite(coinsFromMetadata)) return null;
  return COIN_PACKAGES.find((p) => p.coins === coinsFromMetadata) ?? null;
}

/**
 * Credits the WG Coins package recorded in a Checkout Session's metadata.
 *
 * Idempotent: the Stripe session id is stored on the coin transaction row
 * behind a unique constraint, so Stripe's at-least-once delivery (or a manual
 * redelivery from the dashboard) can never credit one purchase twice. The
 * insert and the balance update share a transaction, so a missing player row
 * rolls both back and lets Stripe retry.
 */
async function fulfillCheckoutSession(session: Stripe.Checkout.Session): Promise<FulfilResult> {
  const metadata = session.metadata ?? {};
  // `userId` is what checkout creation writes; `playerId` and
  // `client_reference_id` keep sessions created before that rename working.
  const rawUserId = metadata["userId"] ?? metadata["playerId"] ?? session.client_reference_id ?? "";
  const playerId = Number(rawUserId);
  const pkg = resolvePackage(metadata);

  console.log(
    `${WEBHOOK_LOG} fulfilling session=${session.id} payment_status=${session.payment_status} userId=${rawUserId || "-"} metadata=${JSON.stringify(metadata)}`,
  );

  // Nothing that identifies one of our buyers or packages: not our session.
  if (!rawUserId && !pkg) {
    return { status: "ignored", reason: "session carries no Waryaa Gaming metadata" };
  }

  if (!Number.isInteger(playerId) || playerId <= 0) {
    logger.warn({ sessionId: session.id, rawUserId }, "Stripe checkout session has no usable player id");
    return { status: "invalid", reason: `unusable userId "${rawUserId}"` };
  }

  if (!pkg) {
    logger.warn(
      { sessionId: session.id, packageId: metadata["packageId"] },
      "Stripe checkout session references an unknown coin package",
    );
    return {
      status: "invalid",
      reason: `unknown coin package (packageId="${metadata["packageId"] ?? ""}", coins="${metadata["coins"] ?? ""}")`,
    };
  }

  console.log(
    `${WEBHOOK_LOG} crediting player=${playerId} package=${pkg.id} coins=${pkg.coins} priceUsd=${pkg.priceUsd} session=${session.id}`,
  );

  const balance = await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(coinTransactionsTable)
      .values({
        playerId,
        packageId: pkg.id,
        coins: pkg.coins,
        priceUsd: pkg.priceUsd,
        stripeSessionId: session.id,
      })
      .onConflictDoNothing({ target: coinTransactionsTable.stripeSessionId })
      .returning({ id: coinTransactionsTable.id });

    // No row inserted means this session was already credited — Stripe's
    // at-least-once delivery, a manual redelivery from the dashboard, or the
    // same session arriving through both `checkout.session.completed` and
    // `payment_intent.succeeded` must never add the coins twice.
    if (inserted.length === 0) return null;

    const [updated] = await tx
      .update(playersTable)
      .set({ coinBalance: sql`${playersTable.coinBalance} + ${pkg.coins}` })
      .where(eq(playersTable.id, playerId))
      .returning({ coinBalance: playersTable.coinBalance });

    if (!updated) throw new Error(`Player ${playerId} not found`);

    return updated.coinBalance;
  });

  if (balance === null) {
    console.log(`${WEBHOOK_LOG} session=${session.id} was already credited — skipping (idempotent)`);
    logger.info({ sessionId: session.id, playerId }, "Stripe checkout session already credited");
    return { status: "already-credited", playerId };
  }

  console.log(
    `${WEBHOOK_LOG} credited player=${playerId} +${pkg.coins} coins (new balance ${balance}) session=${session.id}`,
  );
  logger.info(
    { sessionId: session.id, playerId, packageId: pkg.id, coins: pkg.coins, balance },
    "WG Coins credited from Stripe checkout",
  );

  return { status: "credited", playerId, coins: pkg.coins, balance };
}

/**
 * Routes one signature-verified Stripe event to the coin-crediting logic.
 *
 * Returns the fulfilment result when a Checkout Session was involved, or `null`
 * for events that carry nothing to credit (ignored types, sessions that are not
 * paid yet, payment intents that never went through Checkout).
 */
async function handleVerifiedEvent(event: Stripe.Event): Promise<FulfilResult | null> {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      // Card payments are already `paid` here. Delayed methods (for example
      // bank debits) report `unpaid` and settle later through
      // `checkout.session.async_payment_succeeded` below.
      if (session.payment_status !== "paid") {
        console.log(
          `${WEBHOOK_LOG} session=${session.id} payment_status=${session.payment_status} — not paid yet, waiting for settlement`,
        );
        logger.info(
          { sessionId: session.id, paymentStatus: session.payment_status },
          "Stripe checkout completed but is not paid yet — waiting for settlement",
        );
        return null;
      }
      return fulfillCheckoutSession(session);
    }

    case "checkout.session.async_payment_succeeded":
      return fulfillCheckoutSession(event.data.object);

    case "payment_intent.succeeded": {
      // Safety net for endpoints subscribed to `payment_intent.succeeded`
      // instead of the Checkout events: find the Checkout Session the payment
      // intent belongs to and credit it through the same idempotent path.
      const paymentIntent = event.data.object;
      const sessions = await getStripe().checkout.sessions.list({
        payment_intent: paymentIntent.id,
        limit: 1,
      });
      const session = sessions.data[0];

      if (!session) {
        console.log(
          `${WEBHOOK_LOG} payment_intent=${paymentIntent.id} has no Checkout Session — nothing to credit`,
        );
        return null;
      }

      if (session.payment_status !== "paid") {
        console.log(
          `${WEBHOOK_LOG} payment_intent=${paymentIntent.id} session=${session.id} payment_status=${session.payment_status} — not paid yet`,
        );
        return null;
      }

      return fulfillCheckoutSession(session);
    }

    default:
      console.warn(
        `${WEBHOOK_LOG} ignoring event type "${event.type}" — subscribe this endpoint to ${STRIPE_WEBHOOK_EVENT_TYPES.join(", ")} in the Stripe Dashboard`,
      );
      logger.info({ type: event.type }, "Ignoring Stripe webhook event");
      return null;
  }
}

/**
 * `GET /api/webhooks/stripe` — a plain description of this endpoint.
 *
 * Stripe only ever POSTs here, but humans (and uptime checks) open the URL in a
 * browser. Answering with the endpoint's configuration turns "route not found"
 * confusion into a one-glance check of the Stripe setup.
 */
export function stripeWebhookStatusHandler(_req: Request, res: Response): void {
  res.json({
    endpoint: "stripe-webhook",
    method: "POST",
    handledEvents: STRIPE_WEBHOOK_EVENT_TYPES,
    configured: {
      stripeSecretKey: isStripeConfigured(),
      webhookSecret: Boolean(getStripeWebhookSecret()),
      // `live`, `test`, or `unknown` when the key prefix is not recognisable.
      // Answers "did the live switch actually take effect on this host?"
      mode: getStripeMode(),
    },
  });
}

/**
 * Raw-body Stripe webhook handler for `POST /api/webhooks/stripe`.
 *
 * Mounted in `app.ts` BEFORE `express.json()` because signature verification
 * needs the exact bytes Stripe signed — a re-serialised body would never match.
 * Answers 400 for a missing/invalid signature, 200 once an event has been
 * handled (or safely ignored), and a non-2xx when handling failed so Stripe
 * retries the delivery.
 */
export async function stripeWebhookHandler(req: Request, res: Response): Promise<void> {
  console.log(`${WEBHOOK_LOG} POST received (content-type=${req.get("content-type") ?? "-"})`);

  const webhookSecret = getStripeWebhookSecret();
  if (!webhookSecret) {
    console.error(
      `${WEBHOOK_LOG} STRIPE_WEBHOOK_SECRET is not set on this host — cannot verify the signature`,
    );
    logger.warn("Stripe webhook received but STRIPE_WEBHOOK_SECRET is not set");
    res.status(503).json({ error: "Stripe webhook is not configured" });
    return;
  }

  if (!isStripeConfigured()) {
    console.error(`${WEBHOOK_LOG} STRIPE_SECRET_KEY is not set on this host — cannot verify the signature`);
    res.status(503).json({ error: "Stripe is not configured" });
    return;
  }

  const signature = req.get("stripe-signature");
  if (!signature) {
    console.error(`${WEBHOOK_LOG} rejected: missing stripe-signature header`);
    res.status(400).json({ error: "Missing stripe-signature header" });
    return;
  }

  // The raw bytes Stripe signed, untouched by any JSON parser.
  const rawBody = Buffer.isBuffer(req.body) ? req.body : null;
  if (!rawBody) {
    console.error(`${WEBHOOK_LOG} rejected: body was not the raw application/json payload`);
    res.status(400).json({ error: "Expected a raw application/json body" });
    return;
  }

  console.log(`${WEBHOOK_LOG} verifying signature over ${rawBody.length} raw bytes`);

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    console.error(
      `${WEBHOOK_LOG} rejected: signature verification failed (${err instanceof Error ? err.message : String(err)}) — STRIPE_WEBHOOK_SECRET must be the signing secret of THIS endpoint in the Stripe Dashboard`,
    );
    logger.warn({ err }, "Stripe webhook signature verification failed");
    res.status(400).json({ error: "Invalid Stripe signature" });
    return;
  }

  console.log(`${WEBHOOK_LOG} verified event=${event.id} type=${event.type} livemode=${event.livemode}`);

  // Never fulfil a purchase that belongs to the other Stripe mode: a live key
  // must not credit leftover test-mode sessions (that would hand out free
  // coins), and a test key must not credit live ones. `unknown` keys skip this
  // check rather than risk blocking real payments.
  const keyMode = getStripeMode();
  if (keyMode !== "unknown" && event.livemode !== (keyMode === "live")) {
    console.warn(
      `${WEBHOOK_LOG} ignoring ${event.livemode ? "live" : "test"}-mode event ${event.id} — STRIPE_SECRET_KEY is a ${keyMode}-mode key. Switch the key, STRIPE_WEBHOOK_SECRET and the dashboard endpoint together, then redeliver this event.`,
    );
    res.json({ received: true, ignored: "mode-mismatch" });
    return;
  }

  try {
    const result = await handleVerifiedEvent(event);

    // The event was ours but could not be credited — answer with a non-2xx so
    // the failure shows up in the Stripe Dashboard instead of being swallowed.
    if (result?.status === "invalid") {
      console.error(`${WEBHOOK_LOG} could not credit event=${event.id}: ${result.reason}`);
      res.status(422).json({ error: `Cannot credit this checkout session: ${result.reason}` });
      return;
    }
  } catch (err) {
    console.error(
      `${WEBHOOK_LOG} handling failed for event=${event.id} type=${event.type}:`,
      err instanceof Error ? err.message : err,
    );
    logger.error({ err, type: event.type, eventId: event.id }, "Stripe webhook handling failed");
    res.status(500).json({ error: "Webhook handling failed" });
    return;
  }

  console.log(`${WEBHOOK_LOG} done event=${event.id}`);
  res.json({ received: true });
}

export default router;
