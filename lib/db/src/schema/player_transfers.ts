import { pgTable, serial, integer, timestamp } from "drizzle-orm/pg-core";

export const playerTransfersTable = pgTable("player_transfers", {
  id: serial("id").primaryKey(),
  playerId: integer("player_id").notNull(),
  fromTeamId: integer("from_team_id"),
  toTeamId: integer("to_team_id"),
  transferredAt: timestamp("transferred_at").notNull().defaultNow(),
});

export type PlayerTransfer = typeof playerTransfersTable.$inferSelect;