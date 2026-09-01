import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { createInsertSchema } from "drizzle-zod";

// WG Academy — category-based admin-authored content posts.
// Categories: "player_training" | "tips_tricks" | "formations"
// Rendered on the public /academy page under their respective tabs.
export const academyPostsTable = pgTable("academy_posts", {
  id: serial("id").primaryKey(),
  category: text("category").notNull().default("player_training"),
  // For player_training posts this is the Player Name (searchable).
  title: text("title").notNull(),
  body: text("body").notNull().default(""),
  imageUrl: text("image_url"),
  sortOrder: integer("sort_order").notNull().default(0),
  isPublished: boolean("is_published").notNull().default(true),
  updatedBy: text("updated_by"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const ACADEMY_CATEGORIES = ["player_training", "tips_tricks", "formations"] as const;
export type AcademyCategory = (typeof ACADEMY_CATEGORIES)[number];

export const insertAcademyPostSchema = createInsertSchema(academyPostsTable).omit({
  id: true,
  updatedAt: true,
});
export type InsertAcademyPost = z.infer<typeof insertAcademyPostSchema>;
export type AcademyPost = typeof academyPostsTable.$inferSelect;