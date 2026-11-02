import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { playersTable } from "./players";
import { teamsTable } from "./teams";

/**
 * Clan invitations — the ONLY way a player joins a clan.
 *
 * A President or Coach can no longer add anyone directly: they send an
 * invitation and the invited player accepts or declines it. Accepting is what
 * performs the join (`players.team_id`, the `player_transfers` row and the
 * 1–2 season contract), so membership always requires the player's consent and
 * can never be granted silently from the clan-management page.
 *
 * At most one *pending* invitation may exist per (team, player) pair — enforced
 * by the partial unique index created in `ensureClanRoleSchema()`.
 */
export const teamInvitesTable = pgTable("team_invites", {
  id: serial("id").primaryKey(),
  teamId: integer("team_id").notNull().references(() => teamsTable.id, { onDelete: "cascade" }),
  invitedPlayerId: integer("invited_player_id").notNull().references(() => playersTable.id, { onDelete: "cascade" }),
  invitedById: integer("invited_by_id").references(() => playersTable.id, { onDelete: "set null" }),
  /**
   * Seat being offered. `player` joins the squad; `coach` takes the clan's
   * coach seat and requires the invited player to hold the bought `coach`
   * entitlement.
   */
  role: text("role").notNull().default("player"),
  /** Contract length offered, in seasons (1 or 2). */
  seasons: integer("seasons").notNull().default(1),
  /** 'pending' | 'accepted' | 'declined' | 'cancelled' */
  status: text("status").notNull().default("pending"),
  /** Optional note shown to the invited player. */
  message: text("message"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  respondedAt: timestamp("responded_at"),
});

export type TeamInvite = typeof teamInvitesTable.$inferSelect;
