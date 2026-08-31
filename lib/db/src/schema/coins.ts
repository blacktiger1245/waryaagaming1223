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
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type CoinTransaction = typeof coinTransactionsTable.$inferSelect;