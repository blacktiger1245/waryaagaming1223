import { pgTable, serial, integer, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const hallOfFameTable = pgTable("hall_of_fame", {
  id: serial("id").primaryKey(),
  playerId: integer("player_id").notNull(),
  // Optional reference to an existing season (preferred over the legacy `year`).
  seasonId: integer("season_id"),
  // Active = shown on the public homepage Hall of Fame.
  status: boolean("status").notNull().default(false),
  // Career statistics snapshot taken when the player is activated.
  games: integer("games").notNull().default(0),
  trophies: integer("trophies").notNull().default(0),
  goals: integer("goals").notNull().default(0),
  motmAwards: integer("motm_awards").notNull().default(0),
  achievement: text("achievement").notNull(),
  year: integer("year").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertHallOfFameSchema = createInsertSchema(hallOfFameTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertHallOfFame = z.infer<typeof insertHallOfFameSchema>;
export type HallOfFame = typeof hallOfFameTable.$inferSelect;
