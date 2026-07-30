import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const mediaTable = pgTable("media", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  platform: text("platform").notNull(),
  url: text("url").notNull(),
  embedUrl: text("embed_url").notNull(),
  thumbnailUrl: text("thumbnail_url"),
  description: text("description"),
  publishedAt: text("published_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertMediaSchema = createInsertSchema(mediaTable).omit({ id: true, createdAt: true });
export type InsertMedia = z.infer<typeof insertMediaSchema>;
export type Media = typeof mediaTable.$inferSelect;
