import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const tournamentCategoriesTable = pgTable("tournament_categories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  logoUrl: text("logo_url"),
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertTournamentCategorySchema = createInsertSchema(tournamentCategoriesTable).omit({
  id: true,
  createdAt: true,
});
export type InsertTournamentCategory = z.infer<typeof insertTournamentCategorySchema>;
export type TournamentCategory = typeof tournamentCategoriesTable.$inferSelect;
