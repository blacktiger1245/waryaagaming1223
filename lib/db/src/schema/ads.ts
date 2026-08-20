import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Video interstitial advertisements shown to website visitors.
 *
 * Only the Owner role may manage these records (enforced in the API layer).
 * The video payload itself is stored in object storage (R2) — this table only
 * holds the canonical `/objects/...` path so large files never live in PostgreSQL.
 */
export const adsTable = pgTable("ads", {
  id: serial("id").primaryKey(),
  videoUrl: text("video_url").notNull(),
  targetUrl: text("target_url").notNull(),
  closeAfterSeconds: integer("close_after_seconds").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdBy: integer("created_by").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertAdSchema = createInsertSchema(adsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertAd = z.infer<typeof insertAdSchema>;
export type Ad = typeof adsTable.$inferSelect;