import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { playersTable } from "./players";

/**
 * OAuth tokens for a player's linked Discord account, kept separate from
 * `players` so generic admin/public player endpoints (which `select()` the
 * whole `playersTable` row) never accidentally leak them. Used to silently
 * refresh the player's Discord profile (username/display name/avatar)
 * without requiring them to log in again.
 */
export const discordTokensTable = pgTable("discord_tokens", {
  id: serial("id").primaryKey(),
  playerId: integer("player_id").notNull().unique().references(() => playersTable.id, { onDelete: "cascade" }),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  lastSyncedAt: timestamp("last_synced_at").notNull().defaultNow(),
});

export type DiscordTokens = typeof discordTokensTable.$inferSelect;
