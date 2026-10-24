import { Router, type Request, type Response } from "express";
import type Stripe from "stripe";
import { db, coinTransactionsTable, playersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { COIN_PACKAGES } from "./coins";
import { getStripe, getStripeWebhookSecret, isStripeConfigured } from "../lib/stripe";
import { logger } from "../lib/logger";

const router = Router();

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
      metadata: { playerId: String(me), packageId: pkg.id },
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

/**
 * Credits the WG Coins package recorded in a Checkout Session's metadata.
 *
 * Idempotent: the Stripe session id is stored on the coin transaction row
 * behind a unique constraint, so Stripe's at-least-once delivery (or a manual
 * redelivery from the dashboard) can never credit one purchase twice. The
 * insert and the balance update share a transaction, so a missing player row
 * rolls both back and lets Stripe retry.
 */
async function fulfillCheckoutSession(session: Stripe.Checkout.Session): Promise<void> {
  const playerId = Number(session.metadata?.["playerId"] ?? session.client_reference_id ?? "");
  const packageId = session.metadata?.["packageId"] ?? "";

  if (!Number.isInteger(playerId) || playerId <= 0) {
    logger.warn({ sessionId: session.id }, "Stripe checkout session has no usable player id");
    return;
  }

  const pkg = COIN_PACKAGES.find((p) => p.id === packageId);
  if (!pkg) {
    logger.warn(
      { sessionId: session.id, packageId },
      "Stripe checkout session references an unknown coin package",
    );
    return;
  }

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

    // No row inserted means this session was already credited.
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
    logger.info({ sessionId: session.id, playerId }, "Stripe checkout session already credited");
    return;
  }

  logger.info(
    { sessionId: session.id, playerId, packageId: pkg.id, coins: pkg.coins, balance },
    "WG Coins credited from Stripe checkout",
  );
}

/**
 * Raw-body Stripe webhook handler.
 *
 * Mounted in `app.ts` BEFORE `express.json()` because signature verification
 * needs the exact bytes Stripe signed — a re-serialised body would never match.
 * Any failure returns a non-2xx so Stripe retries the delivery.
 */
export async function stripeWebhookHandler(req: Request, res: Response): Promise<void> {
  const webhookSecret = getStripeWebhookSecret();
  if (!webhookSecret) {
    logger.warn("Stripe webhook received but STRIPE_WEBHOOK_SECRET is not set");
    res.status(503).json({ error: "Stripe webhook is not configured" });
    return;
  }

  const signature = req.get("stripe-signature");
  if (!signature) {
    res.status(400).json({ error: "Missing stripe-signature header" });
    return;
  }

  const payload = Buffer.isBuffer(req.body) ? req.body : null;
  if (!payload) {
    res.status(400).json({ error: "Expected a raw application/json body" });
    return;
  }

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(payload, signature, webhookSecret);
  } catch (err) {
    logger.warn({ err }, "Stripe webhook signature verification failed");
    res.status(400).json({ error: "Invalid Stripe signature" });
    return;
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        // Card payments are already `paid` here. Delayed methods (for example
        // bank debits) report `unpaid` and settle later through
        // `checkout.session.async_payment_succeeded` below.
        if (session.payment_status === "paid") {
          await fulfillCheckoutSession(session);
        } else {
          logger.info(
            { sessionId: session.id, paymentStatus: session.payment_status },
            "Stripe checkout completed but is not paid yet — waiting for settlement",
          );
        }
        break;
      }
      case "checkout.session.async_payment_succeeded":
        await fulfillCheckoutSession(event.data.object);
        break;
      default:
        logger.info({ type: event.type }, "Ignoring Stripe webhook event");
    }
  } catch (err) {
    logger.error({ err, type: event.type, eventId: event.id }, "Stripe webhook handling failed");
    res.status(500).json({ error: "Webhook handling failed" });
    return;
  }

  res.json({ received: true });
}

export default router;
