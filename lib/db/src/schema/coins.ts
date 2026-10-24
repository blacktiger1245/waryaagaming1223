import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { playersTable } from "./players";

/**
 * WG Coins — virtual currency balances live on the player row
 * (`players.coin_balance`), while every purchase/top-up is recorded here for
 * history and auditing.
 */
export const coinTransactionsTable = pgTable("coin_transactions", {
  id: serial("id").primaryKey(),
  playerId: integer("player_id").notNull().references(() => playersTable.id, { onDelete: "cascade" }),
  packageId: text("package_id").notNull(),
  coins: integer("coins").notNull(),
  priceUsd: integer("price_usd").notNull(),
  /**
   * Stripe Checkout Session that paid for this top-up. Unique (and nullable, so
   * non-Stripe rows are unaffected) so a repeated webhook delivery can never
   * credit the same purchase twice.
   */
  stripeSessionId: text("stripe_session_id").unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type CoinTransaction = typeof coinTransactionsTable.$inferSelect;