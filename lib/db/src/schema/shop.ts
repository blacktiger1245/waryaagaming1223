import {
  pgTable,
  serial,
  integer,
  text,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { playersTable } from "./players";

/**
 * WG-SHOP — gaming marketplace (eFootball accounts, coins, Discord Nitro).
 *
 * Products are published from the WG-SHOP Manager dashboard (admin/owner
 * gated in the API layer). `profile_image_path` is always the FIRST uploaded
 * image and doubles as the storefront card main image; `gallery_paths` holds
 * the full ordered screenshot gallery. Images live in object storage (R2) —
 * this table only stores their canonical `/objects/...` paths.
 */
export const shopProductsTable = pgTable("shop_products", {
  id: serial("id").primaryKey(),
  /** 'efootball' | 'coins' | 'nitro' */
  category: text("category").notNull(),
  /** eFootball tier: 'cheap' | 'medium' | 'expensive' — null for other categories */
  subcategory: text("subcategory"),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  /** Price in US cents so no floating point money ever touches the DB. */
  priceCents: integer("price_cents").notNull(),
  profileImagePath: text("profile_image_path"),
  /** Ordered screenshot gallery (profile picture is appended first). */
  galleryPaths: text("gallery_paths").array().notNull().default([]),
  /** eFootball account team strength rating. */
  teamStrength: integer("team_strength"),
  /** Coins product amount label, e.g. "30M Coins". */
  coinAmount: text("coin_amount"),
  /** Nitro plan/duration label, e.g. "1 Month". */
  nitroPlan: text("nitro_plan"),
  konamiIdLinked: boolean("konami_id_linked").notNull().default(false),
  googlePlayLinked: boolean("google_play_linked").notNull().default(false),
  gameCenterLinked: boolean("game_center_linked").notNull().default(false),
  published: boolean("published").notNull().default(false),
  createdBy: integer("created_by").references(() => playersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/**
 * WG-SHOP orders. The storefront has no login UI, so guests place orders with
 * a random `client_id` stored in their browser (acts as a capability token);
 * if the visitor happens to have a platform session the player id is attached
 * as well. Product fields are snapshotted so order history survives edits.
 */
export const shopOrdersTable = pgTable("shop_orders", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").references(() => shopProductsTable.id, { onDelete: "set null" }),
  productTitle: text("product_title").notNull(),
  /** 'efootball' | 'coins' | 'nitro' */
  category: text("category").notNull(),
  priceCents: integer("price_cents").notNull(),
  buyerName: text("buyer_name").notNull(),
  buyerContact: text("buyer_contact").notNull(),
  note: text("note"),
  /** 'pending' | 'processing' | 'completed' | 'cancelled' */
  status: text("status").notNull().default("pending"),
  clientId: text("client_id").notNull(),
  userId: integer("user_id").references(() => playersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertShopProductSchema = createInsertSchema(shopProductsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertShopProduct = z.infer<typeof insertShopProductSchema>;
export type ShopProduct = typeof shopProductsTable.$inferSelect;

export const insertShopOrderSchema = createInsertSchema(shopOrdersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertShopOrder = z.infer<typeof insertShopOrderSchema>;
export type ShopOrder = typeof shopOrdersTable.$inferSelect;
