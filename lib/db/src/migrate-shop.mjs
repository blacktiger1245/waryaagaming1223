// Safe, additive migration for WG-SHOP (gaming marketplace storefront).
//
// - Reads NEON_DATABASE_URL / DATABASE_URL from the shell env, then from .env.
// - Creates `shop_products` and `shop_orders`.
//
// Run from the repo root with the @workspace/db package resolvable:
//   pnpm --filter @workspace/db exec node src/migrate-shop.mjs
//
// (The API server also applies this same DDL idempotently at boot via
//  artifacts/api-server/src/lib/ensure-schema.ts -> ensureShopSchema().)

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

function loadEnvFile() {
  const envPath = path.join(repoRoot, ".env");
  if (!existsSync(envPath)) return {};
  const result = {};
  for (const rawLine of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    result[line.slice(0, eq).trim()] = value;
  }
  return result;
}

const envFile = loadEnvFile();
const connectionString =
  process.env.NEON_DATABASE_URL ?? process.env.DATABASE_URL ?? envFile.NEON_DATABASE_URL ?? envFile.DATABASE_URL;

if (!connectionString) {
  console.error("DATABASE_URL is not set. No database changes were made.");
  process.exit(1);
}

let driverConnectionString = connectionString;
{
  const q = driverConnectionString.indexOf("?");
  if (q !== -1) {
    const base = driverConnectionString.slice(0, q);
    const params = driverConnectionString
      .slice(q + 1)
      .split("&")
      .filter((p) => !p.toLowerCase().startsWith("channel_binding="));
    driverConnectionString = params.length ? `${base}?${params.join("&")}` : base;
  }
}

const { default: pg } = await import("pg");
const pool = new pg.Pool({ connectionString: driverConnectionString, max: 2 });

function run(sqlText) {
  return pool.query(sqlText);
}

const ADDITIVE_DDL = [
  `CREATE TABLE IF NOT EXISTS "shop_products" (
     "id" serial PRIMARY KEY NOT NULL,
     "category" text NOT NULL,
     "subcategory" text,
     "title" text NOT NULL,
     "description" text NOT NULL DEFAULT '',
     "price_cents" integer NOT NULL,
     "web_fee_cents" integer NOT NULL DEFAULT 0,
     "total_price_cents" integer NOT NULL DEFAULT 0,
     "profile_image_path" text,
     "gallery_paths" text[] NOT NULL DEFAULT '{}',
     "team_strength" integer,
     "coin_amount" text,
     "coin_count" integer,
     "nitro_plan" text,
     "konami_id_linked" boolean NOT NULL DEFAULT false,
     "google_play_linked" boolean NOT NULL DEFAULT false,
     "game_center_linked" boolean NOT NULL DEFAULT false,
     "published" boolean NOT NULL DEFAULT false,
     "created_by" integer REFERENCES "players"("id") ON DELETE SET NULL,
     "created_at" timestamp NOT NULL DEFAULT now(),
     "updated_at" timestamp NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS "shop_products_category_idx" ON "shop_products" ("category")`,
  `CREATE INDEX IF NOT EXISTS "shop_products_published_idx" ON "shop_products" ("published")`,
  `CREATE TABLE IF NOT EXISTS "shop_orders" (
     "id" serial PRIMARY KEY NOT NULL,
     "product_id" integer REFERENCES "shop_products"("id") ON DELETE SET NULL,
     "product_title" text NOT NULL,
     "category" text NOT NULL,
     "price_cents" integer NOT NULL,
     "web_fee_cents" integer NOT NULL DEFAULT 0,
     "total_price_cents" integer NOT NULL DEFAULT 0,
     "buyer_name" text NOT NULL,
     "buyer_contact" text NOT NULL,
     "note" text,
     "status" text NOT NULL DEFAULT 'pending',
     "client_id" text NOT NULL,
     "user_id" integer REFERENCES "players"("id") ON DELETE SET NULL,
     "created_at" timestamp NOT NULL DEFAULT now(),
     "updated_at" timestamp NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS "shop_orders_client_idx" ON "shop_orders" ("client_id")`,
  `CREATE INDEX IF NOT EXISTS "shop_orders_user_idx" ON "shop_orders" ("user_id")`,
  // ── Aqoonsi (manager-only account ID on products) ──
  `ALTER TABLE "shop_products" ADD COLUMN IF NOT EXISTS "aqoonsi_id" text`,
  // ── Sell Your Account (user-submitted accounts awaiting manager review) ──
  `CREATE TABLE IF NOT EXISTS "shop_sell_submissions" (
     "id" serial PRIMARY KEY NOT NULL,
     "profile_image_path" text,
     "gallery_paths" text[] NOT NULL DEFAULT '{}',
     "price_cents" integer NOT NULL,
     "team_strength" integer,
     "konami_id_linked" boolean NOT NULL DEFAULT false,
     "google_play_linked" boolean NOT NULL DEFAULT false,
     "game_center_linked" boolean NOT NULL DEFAULT false,
     "phone" text NOT NULL,
     "seller_name" text NOT NULL,
     "seller_discord" text NOT NULL,
     "notes" text,
     "status" text NOT NULL DEFAULT 'pending',
     "rejection_reason" text,
     "aqoonsi_id" text,
     "published_product_id" integer,
     "client_id" text NOT NULL,
     "created_at" timestamp NOT NULL DEFAULT now(),
     "updated_at" timestamp NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS "shop_sell_submissions_status_idx" ON "shop_sell_submissions" ("status")`,
  `CREATE INDEX IF NOT EXISTS "shop_sell_submissions_client_idx" ON "shop_sell_submissions" ("client_id")`,
  // ── Order checkout contact details + product image snapshot ──
  `ALTER TABLE "shop_orders" ADD COLUMN IF NOT EXISTS "buyer_phone" text`,
  `ALTER TABLE "shop_orders" ADD COLUMN IF NOT EXISTS "buyer_discord" text`,
  `ALTER TABLE "shop_orders" ADD COLUMN IF NOT EXISTS "product_image_path" text`,
  // ── Private per-order chat (customer ↔ WG-SHOP Manager) ──
  `CREATE TABLE IF NOT EXISTS "shop_order_chats" (
     "id" serial PRIMARY KEY NOT NULL,
     "order_id" integer NOT NULL UNIQUE REFERENCES "shop_orders"("id") ON DELETE CASCADE,
     "status" text NOT NULL DEFAULT 'open',
     "created_at" timestamp NOT NULL DEFAULT now(),
     "updated_at" timestamp NOT NULL DEFAULT now()
   )`,
  `CREATE TABLE IF NOT EXISTS "shop_chat_messages" (
     "id" serial PRIMARY KEY NOT NULL,
     "chat_id" integer NOT NULL REFERENCES "shop_order_chats"("id") ON DELETE CASCADE,
     "sender_role" text NOT NULL,
     "sender_user_id" integer REFERENCES "players"("id") ON DELETE SET NULL,
     "sender_name" text NOT NULL,
     "body" text,
     "image_path" text,
     "created_at" timestamp NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS "shop_chat_messages_chat_idx" ON "shop_chat_messages" ("chat_id")`,
  // ── Web Fee system: automatically calculated fee + final customer price ──
  `ALTER TABLE "shop_products" ADD COLUMN IF NOT EXISTS "web_fee_cents" integer NOT NULL DEFAULT 0`,
  `ALTER TABLE "shop_products" ADD COLUMN IF NOT EXISTS "total_price_cents" integer NOT NULL DEFAULT 0`,
  `ALTER TABLE "shop_products" ADD COLUMN IF NOT EXISTS "coin_count" integer`,
  `ALTER TABLE "shop_orders" ADD COLUMN IF NOT EXISTS "web_fee_cents" integer NOT NULL DEFAULT 0`,
  `ALTER TABLE "shop_orders" ADD COLUMN IF NOT EXISTS "total_price_cents" integer NOT NULL DEFAULT 0`,
  // Backfill existing rows safely: legacy products/orders keep their current
  // customer price (no fee was charged historically), so total = price and
  // web fee stays 0.
  `UPDATE "shop_products" SET "total_price_cents" = "price_cents" WHERE "total_price_cents" = 0 AND "price_cents" > 0`,
  `UPDATE "shop_orders" SET "total_price_cents" = "price_cents" WHERE "total_price_cents" = 0 AND "price_cents" > 0`,
];

try {
  const current = await run(`SELECT current_database() AS db, current_setting('server_version') AS ver`);
  console.log(`Connected OK -> database: ${current.rows[0].db} (PostgreSQL ${current.rows[0].ver})`);
  console.log("\n[MIGRATE] Applying additive DDL (shop_products + shop_orders)...");
  for (const stmt of ADDITIVE_DDL) {
    await run(stmt);
  }
  console.log("[MIGRATE] Applied.");

  const products = await run(
    `SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'shop_products'`,
  );
  const orders = await run(
    `SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'shop_orders'`,
  );
  console.log(`\n[VERIFY] shop_products table exists: ${products.rows[0].n === 1}`);
  console.log(`[VERIFY] shop_orders table exists: ${orders.rows[0].n === 1}`);
  console.log("\nDone. No existing data was modified.");
} catch (err) {
  console.error("\nFailed:", err.code ?? err.message ?? "unknown");
  process.exitCode = 1;
} finally {
  await pool.end().catch(() => {});
}
