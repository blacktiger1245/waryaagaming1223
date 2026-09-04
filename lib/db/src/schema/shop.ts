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
  /** Automatically calculated Web Fee in US cents = ceil(price_cents / 2000) * 200. */
  webFeeCents: integer("web_fee_cents").notNull().default(0),
  /** Final customer price in US cents = price_cents + web_fee_cents. */
  totalPriceCents: integer("total_price_cents").notNull().default(0),
  profileImagePath: text("profile_image_path"),
  /** Ordered screenshot gallery (profile picture is appended first). */
  galleryPaths: text("gallery_paths").array().notNull().default([]),
  /** eFootball account team strength rating. */
  teamStrength: integer("team_strength"),
  /** Coins product amount label, e.g. "30M Coins". */
  coinAmount: text("coin_amount"),
  /** Exact number of coins for coins products (drives the coins Web Fee). */
  coinCount: integer("coin_count"),
  /** Nitro plan/duration label, e.g. "1 Month". */
  nitroPlan: text("nitro_plan"),
  konamiIdLinked: boolean("konami_id_linked").notNull().default(false),
  googlePlayLinked: boolean("google_play_linked").notNull().default(false),
  gameCenterLinked: boolean("game_center_linked").notNull().default(false),
  /**
   * Manager-only Aqoonsi (the account's ID number, e.g. "12345"). Assigned by
   * the WG-SHOP Manager when approving a seller submission. NEVER serialized
   * into public API responses — the public product serializer omits it and the
   * storefront never sees it.
   */
  aqoonsiId: text("aqoonsi_id"),
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
  /** Snapshot of the automatically calculated Web Fee at purchase time. */
  webFeeCents: integer("web_fee_cents").notNull().default(0),
  /** Snapshot of the final customer price (price + web fee) at purchase time. */
  totalPriceCents: integer("total_price_cents").notNull().default(0),
  buyerName: text("buyer_name").notNull(),
  buyerContact: text("buyer_contact").notNull(),
  /** Customer phone number collected in the Complete Your Order form. */
  buyerPhone: text("buyer_phone"),
  /** Customer Discord username collected in the Complete Your Order form. */
  buyerDiscord: text("buyer_discord"),
  /** Snapshot of the product's main image at purchase time. */
  productImagePath: text("product_image_path"),
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

/**
 * User-submitted eFootball accounts (Sell Your Account).
 *
 * Normal visitors submit their account for sale; submissions always start as
 * `pending` and are never public. The WG-SHOP Manager reviews them in Sell
 * Logs and can Approve (assigning the Aqoonsi ID and a tier, which publishes
 * a `shop_products` row linked via `published_product_id`) or Reject (with an
 * optional reason). `client_id` is the seller's browser capability token —
 * the same mechanism used for guest orders — letting the seller track their
 * own submission status without any login UI.
 */
export const shopSellSubmissionsTable = pgTable("shop_sell_submissions", {
  id: serial("id").primaryKey(),
  profileImagePath: text("profile_image_path"),
  /** All uploaded account screenshots (ordered). */
  galleryPaths: text("gallery_paths").array().notNull().default([]),
  /** Seller's asking price in US cents. */
  priceCents: integer("price_cents").notNull(),
  teamStrength: integer("team_strength"),
  konamiIdLinked: boolean("konami_id_linked").notNull().default(false),
  googlePlayLinked: boolean("google_play_linked").notNull().default(false),
  gameCenterLinked: boolean("game_center_linked").notNull().default(false),
  /** Seller contact details — visible to the manager only, never published. */
  phone: text("phone").notNull(),
  sellerName: text("seller_name").notNull(),
  sellerDiscord: text("seller_discord").notNull(),
  notes: text("notes"),
  /** 'pending' | 'approved' | 'rejected' */
  status: text("status").notNull().default("pending"),
  rejectionReason: text("rejection_reason"),
  /** Manager-only Aqoonsi (account ID). Assigned on approve; never public. */
  aqoonsiId: text("aqoonsi_id"),
  /** The shop_products row created when the submission was approved. */
  publishedProductId: integer("published_product_id"),
  clientId: text("client_id").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type ShopSellSubmission = typeof shopSellSubmissionsTable.$inferSelect;

/**
 * Private per-order chat between the customer and the WG-SHOP Manager.
 * Created automatically when an order moves to `processing`. One row per order
 * (unique order_id). `closed` chats are tombstones: messages were deleted and
 * the conversation can no longer be opened by either side, but the order,
 * product and customer records are untouched.
 */
export const shopOrderChatsTable = pgTable("shop_order_chats", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id")
    .notNull()
    .unique()
    .references(() => shopOrdersTable.id, { onDelete: "cascade" }),
  /** 'open' | 'closed' */
  status: text("status").notNull().default("open"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/**
 * Messages inside an order chat. Either plain text (`body`) or an image
 * attachment (`image_path`, e.g. the generated transcript PNG uploaded to
 * object storage).
 */
export const shopChatMessagesTable = pgTable("shop_chat_messages", {
  id: serial("id").primaryKey(),
  chatId: integer("chat_id")
    .notNull()
    .references(() => shopOrderChatsTable.id, { onDelete: "cascade" }),
  /** 'customer' | 'manager' */
  senderRole: text("sender_role").notNull(),
  senderUserId: integer("sender_user_id").references(() => playersTable.id, { onDelete: "set null" }),
  senderName: text("sender_name").notNull(),
  body: text("body"),
  imagePath: text("image_path"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type ShopOrderChat = typeof shopOrderChatsTable.$inferSelect;
export type ShopChatMessage = typeof shopChatMessagesTable.$inferSelect;

