import { pgTable, serial, text, boolean, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const newsTable = pgTable("news", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  slug: text("slug").notNull().unique(),
  category: text("category").notNull().default("community"),
  content: text("content").notNull(),
  excerpt: text("excerpt"),
  imageUrl: text("image_url"),
  authorId: integer("author_id"),
  authorName: text("author_name"),
  teamId: integer("team_id"),
  isFeatured: boolean("is_featured").notNull().default(false),
  publishedAt: timestamp("published_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertNewsSchema = createInsertSchema(newsTable).omit({ id: true, createdAt: true, publishedAt: true });
export type InsertNews = z.infer<typeof insertNewsSchema>;
export type News = typeof newsTable.$inferSelect;
