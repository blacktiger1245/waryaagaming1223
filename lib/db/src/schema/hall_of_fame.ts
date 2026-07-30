import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const hallOfFameTable = pgTable("hall_of_fame", {
  id: serial("id").primaryKey(),
  playerId: integer("player_id").notNull(),
  achievement: text("achievement").notNull(),
  year: integer("year").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertHallOfFameSchema = createInsertSchema(hallOfFameTable).omit({ id: true, createdAt: true });
export type InsertHallOfFame = z.infer<typeof insertHallOfFameSchema>;
export type HallOfFame = typeof hallOfFameTable.$inferSelect;
