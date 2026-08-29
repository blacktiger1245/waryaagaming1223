import { pgTable, serial, integer, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const seasonsTable = pgTable("seasons", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  isCurrent: boolean("is_current").notNull().default(false),
  // Season awards (admin-assigned): Top Scorer and Ballon d'Or winners.
  topScorerPlayerId: integer("top_scorer_player_id"),
  ballonDorPlayerId: integer("ballon_dor_player_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertSeasonSchema = createInsertSchema(seasonsTable).omit({ id: true, createdAt: true });
export type InsertSeason = z.infer<typeof insertSeasonSchema>;
export type Season = typeof seasonsTable.$inferSelect;
