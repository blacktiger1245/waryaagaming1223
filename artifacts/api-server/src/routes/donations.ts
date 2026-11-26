import { Router, type Request, type Response } from "express";
import { db, donationsTable, playersTable } from "@workspace/db";
import { and, desc, eq } from "drizzle-orm";
import { getStripe, isStripeConfigured } from "../lib/stripe";
import {
  DONATION_AMOUNTS_CENTS,
  DONATION_KIND,
  EVC_ACCOUNT_NAME,
  EVC_NUMBER,
} from "../lib/donations";
import { logger } from "../lib/logger";

const router = Router();

/** Where Stripe sends the donor back to after checkout. */
const DONATION_RETURN_PATH = "/donate";

/**
 * Origin (scheme + host, no trailing slash) of the SPA, used to build Stripe's
 * success/cancel URLs. Same resolution as the coins checkout, so it works on
 * Replit and on split frontend/API hosts alike.
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

// ── GET /donations/config ────────────────────────────────────────────────────
// Public: the EVC Plus account to send money to, the card-donation presets, and
// whether card payments are available on this host.
router.get("/donations/config", (_req: Request, res: Response) => {
  res.json({
    evcNumber: EVC_NUMBER,
    evcAccountName: EVC_ACCOUNT_NAME,
    amountsCents: DONATION_AMOUNTS_CENTS,
    currency: "usd",
    cardEnabled: isStripeConfigured(),
  });
});

// ── GET /donations/me ────────────────────────────────────────────────────────
// Whether the signed-in player is a supporter yet, plus their donation history
// (used by /donate to confirm a card payment and to show a pending EVC transfer).
router.get("/donations/me", async (req: Request, res: Response) => {
  const me = req.session?.userId;
  if (!me) {
    res.json({ isDonor: false, donorSince: null, donations: [] });
    return;
  }

  const [player] = await db
    .select({ donor: playersTable.donor, donorSince: playersTable.donorSince })
    .from(playersTable)
    .where(eq(playersTable.id, me));

  const donations = await db
    .select({
      id: donationsTable.id,
      method: donationsTable.method,
      amountCents: donationsTable.amountCents,
      currency: donationsTable.currency,
      status: donationsTable.status,
      payerName: donationsTable.payerName,
      stripeSessionId: donationsTable.stripeSessionId,
      createdAt: donationsTable.createdAt,
      paidAt: donationsTable.paidAt,
    })
    .from(donationsTable)
    .where(eq(donationsTable.playerId, me))
    .orderBy(desc(donationsTable.createdAt))
    .limit(25);

  res.json({
    isDonor: Boolean(player?.donor),
    donorSince: player?.donorSince?.toISOString() ?? null,
    donations: donations.map((d) => ({
      ...d,
      createdAt: d.createdAt.toISOString(),
      paidAt: d.paidAt?.toISOString() ?? null,
    })),
  });
});

// ── POST /donations/checkout ─────────────────────────────────────────────────
// Starts a hosted Stripe Checkout Session for a card donation and returns the
// URL. The badge is only granted by the webhook once Stripe confirms payment, so
// an abandoned payment never marks anyone a supporter.
router.post("/donations/checkout", async (req: Request, res: Response) => {
  const me = req.session?.userId;
  if (!me) {
    res.status(401).json({ error: "Login required" });
    return;
  }
  if (!isStripeConfigured()) {
    res.status(503).json({ error: "Card donations are not configured yet" });
    return;
  }

  const amountCents = Number((req.body as { amountCents?: unknown } | null)?.amountCents);
  if (!DONATION_AMOUNTS_CENTS.includes(amountCents)) {
    res.status(400).json({ error: "Invalid donation amount" });
    return;
  }

  const [donation] = await db
    .insert(donationsTable)
    .values({ playerId: me, method: "stripe", amountCents, currency: "usd", status: "awaiting_payment" })
    .returning();

  const origin = resolveFrontendOrigin(req);

  try {
    const session = await getStripe().checkout.sessions.create({
      mode: "payment",
      client_reference_id: String(me),
      metadata: {
        kind: DONATION_KIND,
        userId: String(me),
        donationId: String(donation.id),
        amountCents: String(amountCents),
      },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: amountCents,
            product_data: {
              name: "Support Waryaa Gaming",
              description: "Thank you for supporting Somali eFootball",
            },
          },
        },
      ],
      success_url: `${origin}${DONATION_RETURN_PATH}?donation=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}${DONATION_RETURN_PATH}?donation=cancelled`,
    });

    if (!session.url) {
      logger.error({ sessionId: session.id }, "Stripe donation session has no redirect URL");
      res.status(502).json({ error: "Stripe did not return a checkout URL" });
      return;
    }

    await db
      .update(donationsTable)
      .set({ stripeSessionId: session.id })
      .where(eq(donationsTable.id, donation.id));

    res.json({ url: session.url, sessionId: session.id, donationId: donation.id });
  } catch (err) {
    logger.error({ err, donationId: donation.id }, "Could not create Stripe donation session");
    res.status(502).json({ error: "Could not start the card payment. Please try again." });
  }
});

// ── GET /donations/session/:sessionId ────────────────────────────────────────
// Scoped to the caller: reports whether a card donation has been confirmed yet,
// so /donate can show the badge the moment the webhook lands.
router.get("/donations/session/:sessionId", async (req: Request, res: Response) => {
  const me = req.session?.userId;
  if (!me) {
    res.status(401).json({ error: "Login required" });
    return;
  }
  const raw = req.params.sessionId;
  const sessionId = typeof raw === "string" ? raw : "";
  if (!sessionId.startsWith("cs_")) {
    res.status(400).json({ error: "Invalid Checkout Session id" });
    return;
  }

  const [row] = await db
    .select({ status: donationsTable.status, paidAt: donationsTable.paidAt })
    .from(donationsTable)
    .where(and(eq(donationsTable.stripeSessionId, sessionId), eq(donationsTable.playerId, me)));

  res.json({
    sessionId,
    status: row?.status ?? null,
    paid: row?.status === "paid",
    paidAt: row?.paidAt?.toISOString() ?? null,
  });
});

// ── POST /donations/evc-plus ─────────────────────────────────────────────────
// The donor reported an EVC Plus transfer: record the name they sent with and
// park the donation for admin review. Status is granted only on approval.
router.post("/donations/evc-plus", async (req: Request, res: Response) => {
  const me = req.session?.userId;
  if (!me) {
    res.status(401).json({ error: "Login required" });
    return;
  }

  const payerName = String((req.body as { payerName?: unknown } | null)?.payerName ?? "").trim();
  if (!payerName) {
    res.status(400).json({ error: "Please type the name you sent the money with." });
    return;
  }
  if (payerName.length > 80) {
    res.status(400).json({ error: "That name is too long." });
    return;
  }

  const [row] = await db
    .insert(donationsTable)
    .values({ playerId: me, method: "evcplus", amountCents: 0, status: "pending_review", payerName })
    .returning();

  logger.info({ donationId: row.id, playerId: me }, "EVC Plus donation reported — awaiting admin review");
  res.json({ id: row.id, status: row.status });
});


export default router;
