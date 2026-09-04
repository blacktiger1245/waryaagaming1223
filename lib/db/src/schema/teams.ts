import { pgTable, serial, text, integer, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const teamsTable = pgTable("teams", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  tag: text("tag"),
  logoUrl: text("logo_url"),
  /** League division: 'serie_a' | 'serie_b'. */
  division: text("division").notNull().default("serie_a"),
  // Leadership roles (players table holds membership via team_id).
  presidentId: integer("president_id"),
  captainId: integer("captain_id").notNull(),
  coachId: integer("coach_id"),
  wins: integer("wins").notNull().default(0),
  losses: integer("losses").notNull().default(0),
  points: integer("points").notNull().default(0),
  /** Team (clan) ban — same mechanism as player bans. */
  bannedUntil: timestamp("banned_until"),
  banReason: text("ban_reason"),
  bannedBy: text("banned_by"),
  description: text("description"),
  achievements: text("achievements").array().notNull().default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/**
 * Single-row clan registration settings (id is always 1).
 * `serieARegistrationOpen` starts true (first-registered clans land in Serie A);
 * once the admin closes it, new clans register into Serie B (if open).
 */
export const clanSettingsTable = pgTable("clan_settings", {
  id: serial("id").primaryKey(),
  serieARegistrationOpen: boolean("serie_a_registration_open").notNull().default(true),
  serieBRegistrationOpen: boolean("serie_b_registration_open").notNull().default(false),
});

export type ClanSettings = typeof clanSettingsTable.$inferSelect;

export const insertTeamSchema = createInsertSchema(teamsTable).omit({ id: true, createdAt: true });
export type InsertTeam = z.infer<typeof insertTeamSchema>;
export type Team = typeof teamsTable.$inferSelect;
