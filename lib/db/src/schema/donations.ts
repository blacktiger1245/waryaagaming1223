import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { playersTable } from "./players";

/**
 * A donation / support payment to Waryaa Gaming.
 *
 * Two paths, both ending in the donor's account being marked
 * (`players.donor` → yellow name + green tick):
 *
 *   • `stripe`  — the donor pays by card on Stripe's hosted page. The
 *                 `checkout.session.completed` webhook marks this row `paid` and
 *                 grants the donor status automatically.
 *   • `evcplus` — manual mobile money. We show the number and account name; the
 *                 donor types the name they sent the money with and taps
 *                 "I sent the money", moving the row to `pending_review`. An
 *                 admin then approves (granting status) or rejects it.
 *
 * Donor status is only ever granted once a donation is `paid`, so an unpaid row
 * can never earn the badge.
 */
export const donationsTable = pgTable("donations", {
  id: serial("id").primaryKey(),
  playerId: integer("player_id").notNull().references(() => playersTable.id, { onDelete: "cascade" }),
  /** 'stripe' | 'evcplus' */
  method: text("method").notNull(),
  /** Amount in US cents. `0` for a manual EVC Plus transfer (amount not declared). */
  amountCents: integer("amount_cents").notNull().default(0),
  currency: text("currency").notNull().default("usd"),
  /** 'awaiting_payment' | 'pending_review' | 'paid' | 'rejected' | 'cancelled' */
  status: text("status").notNull().default("awaiting_payment"),
  /** The name the donor typed when reporting an EVC Plus transfer. */
  payerName: text("payer_name"),
  /** Stripe Checkout Session that paid this donation. Unique — a redelivery can never double-grant. */
  stripeSessionId: text("stripe_session_id").unique(),
  note: text("note"),
  reviewedById: integer("reviewed_by_id").references(() => playersTable.id, { onDelete: "set null" }),
  reviewedAt: timestamp("reviewed_at"),
  paidAt: timestamp("paid_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type Donation = typeof donationsTable.$inferSelect;
