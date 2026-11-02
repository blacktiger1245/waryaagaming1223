import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { playersTable } from "./players";
import { teamsTable } from "./teams";
import { tournamentsTable } from "./tournaments";

/**
 * Paid clan-tournament registration.
 *
 * A clan tournament may charge an entry fee (`tournaments.registration_fee_cents`).
 * The President or Coach who registers the clan picks a payment method first:
 *
 *   • `stripe`   — the clan pays by card on Stripe's hosted page. The
 *                  `checkout.session.completed` webhook marks this row `approved`
 *                  and inserts the `tournament_participants` row automatically,
 *                  so the clan is registered with no admin action.
 *   • `evcplus`  — manual mobile money. We show the number and amount; the clan
 *                  sends the money and taps "I sent the money", which moves the
 *                  row to `pending_review`. An admin then approves (registering
 *                  the clan and writing an audit log row) or rejects it.
 *
 * No `tournament_participants` row is ever created before the fee is settled, so
 * an unpaid clan can never occupy a slot.
 */
export const clanRegistrationsTable = pgTable("clan_tournament_registrations", {
  id: serial("id").primaryKey(),
  tournamentId: integer("tournament_id").notNull().references(() => tournamentsTable.id, { onDelete: "cascade" }),
  teamId: integer("team_id").notNull().references(() => teamsTable.id, { onDelete: "cascade" }),
  requestedById: integer("requested_by_id").references(() => playersTable.id, { onDelete: "set null" }),
  /** 'stripe' | 'evcplus' */
  method: text("method").notNull(),
  /** 'awaiting_payment' | 'pending_review' | 'approved' | 'rejected' | 'cancelled' */
  status: text("status").notNull().default("awaiting_payment"),
  /** Fee snapshot in US cents at the time of registration. */
  feeCents: integer("fee_cents").notNull().default(0),
  /**
   * Stripe Checkout Session that paid this registration. Unique, exactly like
   * `coin_transactions.stripe_session_id`, so a redelivered webhook can never
   * register (or charge) the same clan twice.
   */
  stripeSessionId: text("stripe_session_id").unique(),
  /** Reference the clan typed when reporting an EVC Plus transfer. */
  payerNote: text("payer_note"),
  reviewedById: integer("reviewed_by_id").references(() => playersTable.id, { onDelete: "set null" }),
  reviewedAt: timestamp("reviewed_at"),
  reviewNote: text("review_note"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type ClanRegistration = typeof clanRegistrationsTable.$inferSelect;

/**
 * Audit trail for clan-registration decisions.
 *
 * Mirrors `match_result_audit_log`: every admin approval/rejection of an EVC Plus
 * registration is recorded with who did it, when, and why, so "the admin accepted
 * my money" can always be verified after the fact.
 */
export const clanRegistrationLogsTable = pgTable("clan_registration_logs", {
  id: serial("id").primaryKey(),
  registrationId: integer("registration_id").notNull().references(() => clanRegistrationsTable.id, { onDelete: "cascade" }),
  tournamentId: integer("tournament_id").notNull(),
  teamId: integer("team_id").notNull(),
  /** Nullable: the legacy password admin session has no player row. */
  adminId: integer("admin_id").references(() => playersTable.id, { onDelete: "set null" }),
  adminName: text("admin_name").notNull(),
  /** 'approved' | 'rejected' */
  action: text("action").notNull(),
  note: text("note"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type ClanRegistrationLog = typeof clanRegistrationLogsTable.$inferSelect;
