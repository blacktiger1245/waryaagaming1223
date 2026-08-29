import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { createInsertSchema } from "drizzle-zod";

// WG Academy — admin-authored content sections (rules, tips, guides, etc.)
// Rendered on the public /academy page with professional auto-formatting.
export const academySectionsTable = pgTable("academy_sections", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  body: text("body").notNull().default(""),
  sortOrder: integer("sort_order").notNull().default(0),
  isPublished: boolean("is_published").notNull().default(true),
  updatedBy: text("updated_by"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertAcademySectionSchema = createInsertSchema(academySectionsTable).omit({
  id: true,
  updatedAt: true,
});
export type InsertAcademySection = z.infer<typeof insertAcademySectionSchema>;
export type AcademySection = typeof academySectionsTable.$inferSelect;