import { pool } from "@workspace/db";
import { logger } from "./logger";

/**
 * Applies the additive, idempotent schema patches the bracket feature needs.
 *
 * These columns live in the drizzle schema and were shipped as standalone
 * migration files (lib/db/drizzle/0004_match_stage.sql, 0005_match_bracket_links.sql),
 * but deployments do not run `drizzle-kit push` automatically. If they are
 * missing, POST /admin/tournaments/:id/generate-matches fails immediately
 * because the match rows now persist `stage` and parent/next bracket links.
 *
 * Every statement uses `ADD COLUMN IF NOT EXISTS` so this is safe to run on
 * every boot and on every schema revision.
 */
export async function ensureMatchBracketSchema(): Promise<void> {
  const statements = [
    `ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "stage" integer DEFAULT 1 NOT NULL;`,
    // Backfill: mark existing knockout matches (by knockout round names) as stage 2.
    `UPDATE "matches" SET "stage" = 2 WHERE "stage" = 1 AND "round_name" ~* '(Quarter Finals|Semi Finals|Grand Final|Final|Round of|Third Place)';`,
    `ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "parent_match1_id" integer;`,
    `ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "parent_match2_id" integer;`,
    `ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "next_match_id" integer;`,
    `ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "next_slot" integer;`,
    // Make tournament start_date nullable so active tournaments can be created without a date.
    `ALTER TABLE "tournaments" ALTER COLUMN "start_date" DROP NOT NULL;`,
  ];

  try {
    for (const sql of statements) {
      await pool.query(sql);
    }

    // Safe runtime verification — only presence/counts, never credentials.
    // Confirms the database actually connected to by the API has the bracket
    // columns and how many rows carry stable parent/next links.
    try {
      const matchColsRes = await pool.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_name = 'matches'
           AND column_name IN ('stage','parent_match1_id','parent_match2_id','next_match_id','next_slot')
         ORDER BY column_name`,
      );
      const countsRes = await pool.query(
        `SELECT
           count(*) FILTER (WHERE stage = 2) AS stage2,
           count(*) FILTER (WHERE stage = 2 AND (parent_match1_id IS NOT NULL OR parent_match2_id IS NOT NULL OR next_match_id IS NOT NULL)) AS linked
         FROM matches`,
      );
      const tourneyColRes = await pool.query(
        `SELECT is_nullable FROM information_schema.columns
         WHERE table_name = 'tournaments' AND column_name = 'start_date'`,
      );
      const matchColumns = matchColsRes.rows.map((r: { column_name: string }) => r.column_name);
      const counts = countsRes.rows[0] ?? { stage2: 0, linked: 0 };
      logger.info(
        {
          matchesColumns: matchColumns,
          stage2Rows: Number(counts.stage2 ?? 0),
          bracketLinkedRows: Number(counts.linked ?? 0),
          tournamentStartDateNullable: tourneyColRes.rows[0]?.is_nullable === "YES",
        },
        "Matches bracket schema verified",
      );
    } catch (verifyErr) {
      logger.warn({ err: verifyErr }, "Could not verify matches bracket schema");
    }
  } catch (err) {
    // Interrupted DDL must not prevent boot; report and continue so the
    // global JSON error handler can surface a meaningful message at request time.
    logger.warn({ err }, "Could not ensure matches bracket schema");
  }
}

/**
 * Creates the WG Academy posts table if it does not exist (additive, idempotent).
 * Replaces the old academy_sections table used by the previous Tournament Rules
 * style academy. Safe to run on every boot.
 */
export async function ensureAcademySchema(): Promise<void> {
  const statements = [
    `CREATE TABLE IF NOT EXISTS "academy_posts" (
       "id" serial PRIMARY KEY,
       "category" text NOT NULL DEFAULT 'player_training',
       "title" text NOT NULL,
       "body" text NOT NULL DEFAULT '',
       "image_url" text,
       "sort_order" integer NOT NULL DEFAULT 0,
       "is_published" boolean NOT NULL DEFAULT true,
       "updated_by" text,
       "updated_at" timestamp NOT NULL DEFAULT now()
     );`,
  ];

  try {
    for (const sql of statements) {
      await pool.query(sql);
    }
  } catch (err) {
    logger.warn({ err }, "Could not ensure academy schema");
  }
}

/**
 * Creates the WG-SHOP tables if they do not exist (additive, idempotent).
 * Mirrors lib/db/src/schema/shop.ts and lib/db/src/migrate-shop.mjs.
 * Safe to run on every boot so deployments without a migration step still
 * get the storefront tables.
 */
export async function ensureShopSchema(): Promise<void> {
  const statements = [
    `CREATE TABLE IF NOT EXISTS "shop_products" (
       "id" serial PRIMARY KEY,
       "category" text NOT NULL,
       "subcategory" text,
       "title" text NOT NULL,
       "description" text NOT NULL DEFAULT '',
       "price_cents" integer NOT NULL,
       "profile_image_path" text,
       "gallery_paths" text[] NOT NULL DEFAULT '{}',
       "team_strength" integer,
       "coin_amount" text,
       "nitro_plan" text,
       "konami_id_linked" boolean NOT NULL DEFAULT false,
       "google_play_linked" boolean NOT NULL DEFAULT false,
       "game_center_linked" boolean NOT NULL DEFAULT false,
       "published" boolean NOT NULL DEFAULT false,
       "created_by" integer REFERENCES "players"("id") ON DELETE SET NULL,
       "created_at" timestamp NOT NULL DEFAULT now(),
       "updated_at" timestamp NOT NULL DEFAULT now()
     );`,
    `CREATE INDEX IF NOT EXISTS "shop_products_category_idx" ON "shop_products" ("category")`,
    `CREATE INDEX IF NOT EXISTS "shop_products_published_idx" ON "shop_products" ("published")`,
    `CREATE TABLE IF NOT EXISTS "shop_orders" (
       "id" serial PRIMARY KEY,
       "product_id" integer REFERENCES "shop_products"("id") ON DELETE SET NULL,
       "product_title" text NOT NULL,
       "category" text NOT NULL,
       "price_cents" integer NOT NULL,
       "buyer_name" text NOT NULL,
       "buyer_contact" text NOT NULL,
       "note" text,
       "status" text NOT NULL DEFAULT 'pending',
       "client_id" text NOT NULL,
       "user_id" integer REFERENCES "players"("id") ON DELETE SET NULL,
       "created_at" timestamp NOT NULL DEFAULT now(),
       "updated_at" timestamp NOT NULL DEFAULT now()
     );`,
    `CREATE INDEX IF NOT EXISTS "shop_orders_client_idx" ON "shop_orders" ("client_id")`,
    `CREATE INDEX IF NOT EXISTS "shop_orders_user_idx" ON "shop_orders" ("user_id")`,
    // Aqoonsi (manager-only account ID on products)
    `ALTER TABLE "shop_products" ADD COLUMN IF NOT EXISTS "aqoonsi_id" text`,
    // Sell Your Account (user-submitted accounts awaiting manager review)
    `CREATE TABLE IF NOT EXISTS "shop_sell_submissions" (
       "id" serial PRIMARY KEY,
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
     );`,
    `CREATE INDEX IF NOT EXISTS "shop_sell_submissions_status_idx" ON "shop_sell_submissions" ("status")`,
    `CREATE INDEX IF NOT EXISTS "shop_sell_submissions_client_idx" ON "shop_sell_submissions" ("client_id")`,
    // Order checkout contact details + product image snapshot
    `ALTER TABLE "shop_orders" ADD COLUMN IF NOT EXISTS "buyer_phone" text`,
    `ALTER TABLE "shop_orders" ADD COLUMN IF NOT EXISTS "buyer_discord" text`,
    `ALTER TABLE "shop_orders" ADD COLUMN IF NOT EXISTS "product_image_path" text`,
    // Private per-order chat (customer ↔ WG-SHOP Manager)
    `CREATE TABLE IF NOT EXISTS "shop_order_chats" (
       "id" serial PRIMARY KEY,
       "order_id" integer NOT NULL UNIQUE REFERENCES "shop_orders"("id") ON DELETE CASCADE,
       "status" text NOT NULL DEFAULT 'open',
       "created_at" timestamp NOT NULL DEFAULT now(),
       "updated_at" timestamp NOT NULL DEFAULT now()
     );`,
    `CREATE TABLE IF NOT EXISTS "shop_chat_messages" (
       "id" serial PRIMARY KEY,
       "chat_id" integer NOT NULL REFERENCES "shop_order_chats"("id") ON DELETE CASCADE,
       "sender_role" text NOT NULL,
       "sender_user_id" integer REFERENCES "players"("id") ON DELETE SET NULL,
       "sender_name" text NOT NULL,
       "body" text,
       "image_path" text,
       "created_at" timestamp NOT NULL DEFAULT now()
     );`,
    `CREATE INDEX IF NOT EXISTS "shop_chat_messages_chat_idx" ON "shop_chat_messages" ("chat_id")`,
  ];

  try {
    for (const sql of statements) {
      await pool.query(sql);
    }
  } catch (err) {
    logger.warn({ err }, "Could not ensure WG-SHOP schema");
  }
}