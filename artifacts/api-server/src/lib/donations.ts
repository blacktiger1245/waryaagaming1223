import { db, donationsTable, playersTable } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import type Stripe from "stripe";
import { logger } from "./logger";

/**
 * Waryaa Gaming "supporters" — a donation either paid by card (Stripe Checkout)
 * or reported as an EVC Plus transfer. Both paths end here, so the "mark the
 * player as a supporter" step exists exactly once and can never run twice.
 */

/** Metadata `kind` that marks a Stripe Checkout Session as a donation. */
export const DONATION_KIND = "donation";

/** The EVC Plus account donors send mobile money to. */
export const EVC_NUMBER = "+252 61 3256466";
export const EVC_ACCOUNT_NAME = "Waryaa Gaming Store";

/** Card-donation presets, in US cents. */
export const DONATION_AMOUNTS_CENTS: readonly number[] = [200, 500, 1000, 2500, 5000];

/**
 * Grant supporter status (yellow name + green tick) to a player.
 *
 * Idempotent: the first call sets `donor` and `donor_since`; later calls are
 * no-ops, so a supporter keeps their original donation date.
 */
export async function grantDonorStatus(playerId: number): Promise<void> {
  const updated = await db
    .update(playersTable)
    .set({ donor: true, donorSince: new Date() })
    .where(and(eq(playersTable.id, playerId), eq(playersTable.donor, false)))
    .returning({ id: playersTable.id });

  if (updated.length === 0) {
    logger.info({ playerId }, "Donation received from an existing supporter (badge already granted)");
  }
}

/**
 * Confirm a Stripe-paid donation and grant the supporter badge.
 *
 * Idempotent by construction: the donation is found through the unique
 * `stripe_session_id` (falling back to the id in the session metadata), the
 * status transition happens at most once, and `grantDonorStatus` never moves an
 * existing donor's date — so a redelivered webhook can never double-grant.
 */
export async function fulfillDonation(
  session: Stripe.Checkout.Session,
): Promise<"paid" | "already-paid" | "not-found"> {
  const metadataDonationId = Number(session.metadata?.["donationId"]);

  const [bySession] = await db
    .select()
    .from(donationsTable)
    .where(eq(donationsTable.stripeSessionId, session.id));

  let donation = bySession;
  if (!donation && Number.isInteger(metadataDonationId) && metadataDonationId > 0) {
    [donation] = await db
      .select()
      .from(donationsTable)
      .where(eq(donationsTable.id, metadataDonationId));
  }

  if (!donation) {
    logger.warn(
      { sessionId: session.id, donationId: session.metadata?.["donationId"] },
      "Stripe donation session has no matching donation row",
    );
    return "not-found";
  }

  if (donation.status === "paid") return "already-paid";

  await db
    .update(donationsTable)
    .set({
      status: "paid",
      paidAt: new Date(),
      reviewedAt: new Date(),
      stripeSessionId: session.id,
      note: "Paid by card through Stripe Checkout",
    })
    .where(and(eq(donationsTable.id, donation.id), sql`${donationsTable.status} <> 'paid'`));

  await grantDonorStatus(donation.playerId);

  logger.info(
    { donationId: donation.id, playerId: donation.playerId, amountCents: donation.amountCents },
    "Donation paid by card — supporter badge granted",
  );
  return "paid";
}
