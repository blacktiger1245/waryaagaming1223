import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import {
  db,
  shopProductsTable,
  shopOrdersTable,
  shopSellSubmissionsTable,
  shopOrderChatsTable,
  shopChatMessagesTable,
  playersTable,
} from "@workspace/db";
import { ObjectStorageService } from "../lib/objectStorage";
import { and, asc, eq, desc, or } from "drizzle-orm";

const router: IRouter = Router();

// Server→R2 uploader reused for Sell Your Account image uploads (public).
const objectStorageService = new ObjectStorageService();

// ─── Constants / validation helpers ──────────────────────────────────────────
export const SHOP_CATEGORIES = ["efootball", "coins", "nitro"] as const;
export const EFOOTBALL_TIERS = ["cheap", "medium", "expensive"] as const;
export const SHOP_ORDER_STATUSES = ["pending", "processing", "completed", "cancelled"] as const;

type ShopCategory = (typeof SHOP_CATEGORIES)[number];
type OrderStatus = (typeof SHOP_ORDER_STATUSES)[number];

function isShopCategory(value: unknown): value is ShopCategory {
  return typeof value === "string" && (SHOP_CATEGORIES as readonly string[]).includes(value);
}

function isEfootballTier(value: unknown): value is (typeof EFOOTBALL_TIERS)[number] {
  return typeof value === "string" && (EFOOTBALL_TIERS as readonly string[]).includes(value);
}

function isOrderStatus(value: unknown): value is OrderStatus {
  return typeof value === "string" && (SHOP_ORDER_STATUSES as readonly string[]).includes(value);
}

/** Non-empty string, trimmed to maxLen. Returns null when empty/invalid. */
function cleanString(value: unknown, maxLen: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLen);
}

function isPositiveInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

/**
 * Gallery paths must be object-storage paths (/objects/...) produced by the
 * storage layer. Anything else is rejected so product cards only ever render
 * images this system uploaded.
 */
function cleanGallery(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const paths: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") return null;
    const trimmed = entry.trim();
    if (!trimmed) continue;
    if (!trimmed.startsWith("/objects/") && !/^\/api\/storage\//i.test(trimmed)) return null;
    paths.push(trimmed.slice(0, 500));
  }
  return paths;
}

// ─── WG-SHOP Manager authorization ───────────────────────────────────────────
// Mirrors requireAdmin() in routes/admin.ts: a Discord session whose player
// role is 'admin' | 'owner', or the legacy password-based isAdmin flag.
// Customers (role 'player') and anonymous visitors never pass this gate, so
// manager controls stay fully server-enforced.
function isShopManager(req: Request): boolean {
  const discordManager =
    !!req.session?.userId && (req.session?.role === "admin" || req.session?.role === "owner");
  return discordManager || !!req.session?.isAdmin;
}

function requireShopManager(req: Request, res: Response, next: NextFunction) {
  if (isShopManager(req)) {
    return next();
  }
  return res.status(401).json({ error: "WG-SHOP Manager authentication required" });
}

// ─── Serialization ────────────────────────────────────────────────────────────
function toProductJson(p: typeof shopProductsTable.$inferSelect) {
  return {
    id: p.id,
    category: p.category,
    subcategory: p.subcategory,
    title: p.title,
    description: p.description,
    priceCents: p.priceCents,
    profileImagePath: p.profileImagePath,
    galleryPaths: p.galleryPaths ?? [],
    teamStrength: p.teamStrength,
    coinAmount: p.coinAmount,
    nitroPlan: p.nitroPlan,
    konamiIdLinked: p.konamiIdLinked,
    googlePlayLinked: p.googlePlayLinked,
    gameCenterLinked: p.gameCenterLinked,
    published: p.published,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

function toOrderJson(o: typeof shopOrdersTable.$inferSelect) {
  return {
    id: o.id,
    productId: o.productId,
    productTitle: o.productTitle,
    category: o.category,
    priceCents: o.priceCents,
    buyerName: o.buyerName,
    buyerContact: o.buyerContact,
    buyerPhone: o.buyerPhone,
    buyerDiscord: o.buyerDiscord,
    productImagePath: o.productImagePath,
    note: o.note,
    status: o.status,
    clientId: o.clientId,
    createdAt: o.createdAt.toISOString(),
    updatedAt: o.updatedAt.toISOString(),
  };
}

/**
 * Manager product JSON — the public product fields PLUS the manager-only
 * Aqoonsi. Public endpoints always use toProductJson, so the Aqoonsi never
 * reaches a customer.
 */
function toManagerProductJson(p: typeof shopProductsTable.$inferSelect, createdByUsername?: string | null) {
  return {
    ...toProductJson(p),
    aqoonsiId: p.aqoonsiId,
    ...(createdByUsername !== undefined ? { createdByUsername: createdByUsername ?? null } : {}),
  };
}

/**
 * Sell submission JSON. Seller-facing responses ("My Submissions") and manager
 * Sell Logs share the same base fields (the seller always sees their own
 * contact details and status). With `managerView` the response additionally
 * carries the Aqoonsi and the published product id — manager eyes only.
 */
function toSellSubmissionJson(s: typeof shopSellSubmissionsTable.$inferSelect, managerView = false) {
  return {
    id: s.id,
    profileImagePath: s.profileImagePath,
    galleryPaths: s.galleryPaths ?? [],
    priceCents: s.priceCents,
    teamStrength: s.teamStrength,
    konamiIdLinked: s.konamiIdLinked,
    googlePlayLinked: s.googlePlayLinked,
    gameCenterLinked: s.gameCenterLinked,
    phone: s.phone,
    sellerName: s.sellerName,
    sellerDiscord: s.sellerDiscord,
    notes: s.notes,
    status: s.status,
    rejectionReason: s.rejectionReason,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
    ...(managerView ? { aqoonsiId: s.aqoonsiId, publishedProductId: s.publishedProductId } : {}),
  };
}

// ─── Category/subcategory filters shared by list endpoints ───────────────────
function categoryFilters(query: Request["query"]) {
  const conditions = [];
  if (typeof query.category === "string" && isShopCategory(query.category)) {
    conditions.push(eq(shopProductsTable.category, query.category));
  }
  if (typeof query.subcategory === "string" && isEfootballTier(query.subcategory)) {
    conditions.push(eq(shopProductsTable.subcategory, query.subcategory));
  }
  return conditions;
}

// ═══════════════════════════════ Storefront (public) ═════════════════════════

// ─── GET /shop/products ──────────────────────────────────────────────────────
// Published products only. Filter by ?category= and ?subcategory= (eFootball
// tiers: cheap | medium | expensive).
router.get("/shop/products", async (req, res) => {
  try {
    const rows = await db
      .select()
      .from(shopProductsTable)
      .where(and(eq(shopProductsTable.published, true), ...categoryFilters(req.query)))
      .orderBy(desc(shopProductsTable.createdAt));

    return res.json({ products: rows.map(toProductJson) });
  } catch (error: unknown) {
    req.log.error({ err: error }, "Error listing shop products");
    return res.status(500).json({ error: "Failed to load products" });
  }
});

// ─── GET /shop/products/:id ──────────────────────────────────────────────────
router.get("/shop/products/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "Invalid product id" });
  }

  try {
    const [product] = await db
      .select()
      .from(shopProductsTable)
      .where(and(eq(shopProductsTable.id, id), eq(shopProductsTable.published, true)));
    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }
    return res.json({ product: toProductJson(product) });
  } catch (error: unknown) {
    req.log.error({ err: error }, "Error loading shop product");
    return res.status(500).json({ error: "Failed to load product" });
  }
});

// ─── POST /shop/orders ───────────────────────────────────────────────────────
// Guest checkout — the storefront intentionally has no login UI. `clientId` is
// a random token kept in the buyer's browser; it is the lookup key for the
// My Orders page. When a platform session exists we attach the player id too.
router.post("/shop/orders", async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;

  const productId = Number(body.productId);
  if (!Number.isInteger(productId) || productId <= 0) {
    return res.status(400).json({ error: "A valid productId is required" });
  }
  const buyerName = cleanString(body.buyerName, 80);
  if (!buyerName) {
    return res.status(400).json({ error: "Your name is required" });
  }
  // Complete Your Order form: phone + full name + Discord username.
  const buyerPhone = cleanString(body.buyerPhone, 40);
  if (!buyerPhone) {
    return res.status(400).json({ error: "Your phone number is required" });
  }
  // buyerDiscord is the new field; buyerContact kept for legacy clients.
  const buyerDiscord = cleanString(body.buyerDiscord, 80) ?? cleanString(body.buyerContact, 120);
  if (!buyerDiscord) {
    return res.status(400).json({ error: "Your Discord username is required" });
  }
  const clientId = cleanString(body.clientId, 64);
  if (!clientId || !/^[A-Za-z0-9_-]{8,64}$/.test(clientId)) {
    return res.status(400).json({ error: "Invalid checkout session — please refresh and try again" });
  }
  const note = cleanString(body.note, 500);

  try {
    const [product] = await db
      .select()
      .from(shopProductsTable)
      .where(and(eq(shopProductsTable.id, productId), eq(shopProductsTable.published, true)));
    if (!product) {
      return res.status(404).json({ error: "This product is no longer available" });
    }

    const [order] = await db
      .insert(shopOrdersTable)
      .values({
        productId: product.id,
        productTitle: product.title,
        category: product.category,
        priceCents: product.priceCents,
        buyerName,
        buyerContact: buyerDiscord,
        buyerPhone,
        buyerDiscord,
        productImagePath: product.profileImagePath,
        note,
        status: "pending",
        clientId,
        userId: req.session?.userId ?? null,
      })
      .returning();

    return res.status(201).json({ order: toOrderJson(order) });
  } catch (error: unknown) {
    req.log.error({ err: error }, "Error creating shop order");
    return res.status(500).json({ error: "Failed to place order" });
  }
});

// ─── GET /shop/orders ────────────────────────────────────────────────────────
// My Orders — matches the browser's clientId; also merges orders placed while
// a platform session (Discord login elsewhere on the site) was active.
router.get("/shop/orders", async (req, res) => {
  const clientId = typeof req.query.clientId === "string" ? req.query.clientId : "";
  const sessionUserId = req.session?.userId;

  if (!clientId && !sessionUserId) {
    return res.json({ orders: [] });
  }

  try {
    const keys = [];
    if (clientId) keys.push(eq(shopOrdersTable.clientId, clientId));
    if (sessionUserId) keys.push(eq(shopOrdersTable.userId, sessionUserId));

    const rows = await db
      .select()
      .from(shopOrdersTable)
      .where(or(...keys))
      .orderBy(desc(shopOrdersTable.createdAt))
      .limit(100);

    return res.json({ orders: rows.map(toOrderJson) });
  } catch (error: unknown) {
    req.log.error({ err: error }, "Error listing shop orders");
    return res.status(500).json({ error: "Failed to load orders" });
  }
});

// ═══════════════════ Order chats (customer ↔ manager) ═══════════════════════

function toChatMessageJson(m: typeof shopChatMessagesTable.$inferSelect) {
  return {
    id: m.id,
    chatId: m.chatId,
    senderRole: m.senderRole,
    senderName: m.senderName,
    body: m.body,
    imagePath: m.imagePath,
    createdAt: m.createdAt.toISOString(),
  };
}

/**
 * Load an order and authorize the requester: only the WG-SHOP Manager or the
 * order's own customer (matching platform user id OR browser clientId) may
 * touch its chat. Customer A can never reach Customer B's chat — this is
 * enforced here on the server, not just in the UI.
 */
async function authorizeOrderAccess(
  req: Request,
  res: Response,
  orderId: number,
  clientId: string,
): Promise<{ order: typeof shopOrdersTable.$inferSelect; isManager: boolean } | null> {
  const [order] = await db.select().from(shopOrdersTable).where(eq(shopOrdersTable.id, orderId));
  if (!order) {
    res.status(404).json({ error: "Order not found" });
    return null;
  }
  const isManager = isShopManager(req);
  const isCustomer =
    (!!order.userId && !!req.session?.userId && order.userId === req.session.userId) ||
    (!!clientId && clientId === order.clientId);
  if (!isManager && !isCustomer) {
    res.status(403).json({ error: "You do not have access to this order chat" });
    return null;
  }
  return { order, isManager };
}

// ─── GET /shop/orders/:id/chat ───────────────────────────────────────────────
// Open (and lazily create) the private chat for an order. Available once the
// order is Processing or later; Pending orders have no chat yet.
router.get("/shop/orders/:id/chat", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "Invalid order id" });
  }
  const clientId = typeof req.query.clientId === "string" ? req.query.clientId : "";

  try {
    const ctx = await authorizeOrderAccess(req, res, id, clientId);
    if (!ctx) return;

    let [chat] = await db.select().from(shopOrderChatsTable).where(eq(shopOrderChatsTable.orderId, id));
    if (chat && chat.status === "closed") {
      return res.status(410).json({ error: "This chat was closed and deleted by the manager" });
    }
    if (!chat) {
      if (ctx.order.status !== "processing" && ctx.order.status !== "completed") {
        return res.status(409).json({ error: "The order chat opens when the order status is Processing" });
      }
      [chat] = await db.insert(shopOrderChatsTable).values({ orderId: id }).returning();
    }

    const messages = await db
      .select()
      .from(shopChatMessagesTable)
      .where(eq(shopChatMessagesTable.chatId, chat.id))
      .orderBy(asc(shopChatMessagesTable.createdAt))
      .limit(500);

    return res.json({
      chat: {
        id: chat.id,
        orderId: chat.orderId,
        status: chat.status,
        createdAt: chat.createdAt.toISOString(),
        updatedAt: chat.updatedAt.toISOString(),
      },
      order: toOrderJson(ctx.order),
      messages: messages.map(toChatMessageJson),
      viewer: ctx.isManager ? "manager" : "customer",
    });
  } catch (error: unknown) {
    req.log.error({ err: error }, "Error loading order chat");
    return res.status(500).json({ error: "Failed to load the order chat" });
  }
});

// ─── POST /shop/orders/:id/chat/messages ─────────────────────────────────────
// Send a chat message. The sender role is decided by the SERVER from the
// session — a customer can never post as the manager and vice versa.
router.post("/shop/orders/:id/chat/messages", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "Invalid order id" });
  }
  const body = (req.body ?? {}) as Record<string, unknown>;
  const clientId = cleanString(body.clientId, 64) ?? "";
  const text = cleanString(body.body, 2000);
  if (!text) {
    return res.status(400).json({ error: "Message cannot be empty" });
  }

  try {
    const ctx = await authorizeOrderAccess(req, res, id, clientId);
    if (!ctx) return;

    const [chat] = await db.select().from(shopOrderChatsTable).where(eq(shopOrderChatsTable.orderId, id));
    if (!chat || chat.status === "closed") {
      return res.status(410).json({ error: "This chat was closed and deleted by the manager" });
    }

    let senderName = ctx.order.buyerName;
    let senderUserId: number | null = null;
    if (ctx.isManager) {
      senderName = "WG-SHOP Manager";
      senderUserId = req.session?.userId ?? null;
      if (senderUserId) {
        const [player] = await db
          .select({ username: playersTable.username })
          .from(playersTable)
          .where(eq(playersTable.id, senderUserId));
        if (player?.username) senderName = player.username;
      }
    }

    const [message] = await db
      .insert(shopChatMessagesTable)
      .values({
        chatId: chat.id,
        senderRole: ctx.isManager ? "manager" : "customer",
        senderUserId,
        senderName,
        body: text,
      })
      .returning();
    await db
      .update(shopOrderChatsTable)
      .set({ updatedAt: new Date() })
      .where(eq(shopOrderChatsTable.id, chat.id));

    return res.status(201).json({ message: toChatMessageJson(message) });
  } catch (error: unknown) {
    req.log.error({ err: error }, "Error sending chat message");
    return res.status(500).json({ error: "Failed to send the message" });
  }
});

// ─── GET /shop/orders/:id/chat/transcript-data ───────────────────────────────
// Manager-only. Returns everything needed to draw the transcript PNG,
// including the product's Aqoonsi for eFootball orders (this endpoint is
// manager-gated, so the private Account No never reaches customers here).
router.get("/shop/orders/:id/chat/transcript-data", requireShopManager, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "Invalid order id" });
  }

  try {
    const [order] = await db.select().from(shopOrdersTable).where(eq(shopOrdersTable.id, id));
    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    let product: ReturnType<typeof toManagerProductJson> | null = null;
    if (order.productId) {
      const [p] = await db.select().from(shopProductsTable).where(eq(shopProductsTable.id, order.productId));
      if (p) product = toManagerProductJson(p);
    }

    return res.json({ order: toOrderJson(order), product });
  } catch (error: unknown) {
    req.log.error({ err: error }, "Error loading transcript data");
    return res.status(500).json({ error: "Failed to load transcript data" });
  }
});

// ─── POST /shop/orders/:id/chat/transcript ───────────────────────────────────
// Manager-only. Receives the generated transcript PNG (data URL), stores it in
// object storage and posts it to the chat as a real image message the customer
// can view and download. Plain-text transcripts are never sent.
const CHAT_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
router.post("/shop/orders/:id/chat/transcript", requireShopManager, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "Invalid order id" });
  }
  const body = (req.body ?? {}) as Record<string, unknown>;
  const dataUrl = typeof body.dataUrl === "string" ? body.dataUrl : "";
  const match = /^data:(image\/png);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match) {
    return res.status(400).json({ error: "A PNG transcript image is required" });
  }
  const buffer = Buffer.from(match[2], "base64");
  if (buffer.length === 0) {
    return res.status(400).json({ error: "The transcript image is empty" });
  }
  if (buffer.length > CHAT_IMAGE_MAX_BYTES) {
    return res.status(413).json({ error: "The transcript image is too large" });
  }

  try {
    const [chat] = await db.select().from(shopOrderChatsTable).where(eq(shopOrderChatsTable.orderId, id));
    if (!chat || chat.status === "closed") {
      return res.status(409).json({ error: "This chat is no longer active" });
    }

    const objectPath = await objectStorageService.uploadObject(buffer, "image/png");
    const [message] = await db
      .insert(shopChatMessagesTable)
      .values({
        chatId: chat.id,
        senderRole: "manager",
        senderUserId: req.session?.userId ?? null,
        senderName: "WG-SHOP Manager",
        body: "WG-SHOP Order Transcript",
        imagePath: objectPath,
      })
      .returning();
    await db
      .update(shopOrderChatsTable)
      .set({ updatedAt: new Date() })
      .where(eq(shopOrderChatsTable.id, chat.id));

    return res.status(201).json({ message: toChatMessageJson(message) });
  } catch (error: unknown) {
    req.log.error({ err: error }, "Error sending transcript to order chat");
    return res.status(500).json({ error: "Failed to send the transcript" });
  }
});

// ─── DELETE /shop/orders/:id/chat ────────────────────────────────────────────
// Manager-only. Permanently deletes all chat messages and tombstones the chat
// (status 'closed') so neither side can reopen it. The order, product and
// customer records are NOT touched.
router.delete("/shop/orders/:id/chat", requireShopManager, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "Invalid order id" });
  }

  try {
    const [chat] = await db.select().from(shopOrderChatsTable).where(eq(shopOrderChatsTable.orderId, id));
    if (!chat) {
      return res.status(404).json({ error: "Chat not found" });
    }
    if (chat.status !== "closed") {
      await db.delete(shopChatMessagesTable).where(eq(shopChatMessagesTable.chatId, chat.id));
      await db
        .update(shopOrderChatsTable)
        .set({ status: "closed", updatedAt: new Date() })
        .where(eq(shopOrderChatsTable.id, chat.id));
    }
    return res.json({ ok: true });
  } catch (error: unknown) {
    req.log.error({ err: error }, "Error closing order chat");
    return res.status(500).json({ error: "Failed to close the chat" });
  }
});

// ─── GET /admin/shop/chats ───────────────────────────────────────────────────
// Manager-only. All open order chats with their order summary, so the Orders
// page knows which orders have an active chat.
router.get("/admin/shop/chats", requireShopManager, async (req, res) => {
  try {
    const rows = await db
      .select({ chat: shopOrderChatsTable, order: shopOrdersTable })
      .from(shopOrderChatsTable)
      .innerJoin(shopOrdersTable, eq(shopOrderChatsTable.orderId, shopOrdersTable.id))
      .where(eq(shopOrderChatsTable.status, "open"))
      .orderBy(desc(shopOrderChatsTable.updatedAt))
      .limit(200);

    return res.json({
      chats: rows.map((r) => ({
        chatId: r.chat.id,
        orderId: r.order.id,
        orderStatus: r.order.status,
        buyerName: r.order.buyerName,
        productTitle: r.order.productTitle,
        priceCents: r.order.priceCents,
        updatedAt: r.chat.updatedAt.toISOString(),
      })),
    });
  } catch (error: unknown) {
    req.log.error({ err: error }, "Error listing order chats");
    return res.status(500).json({ error: "Failed to load chats" });
  }
});

// ═════════════════════ Sell Your Account (public) ═══════════════════════════

// ─── POST /shop/sell/uploads ─────────────────────────────────────────────────
// Public image upload for sellers. Deliberately NOT admin-gated (unlike
// /storage/uploads/direct) because sellers are anonymous visitors — but it is
// restricted to images up to 10 MB.
const SELL_UPLOAD_MAX_BYTES = 10 * 1024 * 1024;
router.post("/shop/sell/uploads", async (req, res) => {
  if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
    return res.status(400).json({ error: "An image file is required" });
  }
  const contentType = req.get("content-type") || "application/octet-stream";
  if (!contentType.startsWith("image/")) {
    return res.status(400).json({ error: "Only image uploads are supported" });
  }
  if (req.body.length > SELL_UPLOAD_MAX_BYTES) {
    return res.status(413).json({ error: "Image is too large — maximum 10 MB" });
  }

  try {
    const objectPath = await objectStorageService.uploadObject(req.body, contentType);
    return res.status(201).json({ objectPath });
  } catch (error: unknown) {
    req.log.error({ err: error }, "Error uploading sell submission image");
    return res.status(500).json({ error: "Failed to upload image" });
  }
});

// ─── POST /shop/sell ─────────────────────────────────────────────────────────
// Submit an eFootball account for sale. The seller only describes the account
// (no tier choice — the WG-SHOP Manager assigns Cheap/Normal/Expensive when
// approving). Submissions always start as 'pending' and stay invisible to
// customers until a manager approves them in Sell Logs.
router.post("/shop/sell", async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;

  const clientId = cleanString(body.clientId, 64);
  if (!clientId || !/^[A-Za-z0-9_-]{8,64}$/.test(clientId)) {
    return res.status(400).json({ error: "Invalid submission session — please refresh and try again" });
  }

  const sellerName = cleanString(body.sellerName, 80);
  if (!sellerName) return res.status(400).json({ error: "Your full name is required" });
  const phone = cleanString(body.phone, 40);
  if (!phone) return res.status(400).json({ error: "Your phone number is required" });
  const sellerDiscord = cleanString(body.sellerDiscord, 80);
  if (!sellerDiscord) return res.status(400).json({ error: "Your Discord username is required" });

  if (!isPositiveInt(body.priceCents)) {
    return res.status(400).json({ error: "A price greater than zero is required" });
  }

  const teamStrength = isPositiveInt(body.teamStrength) ? body.teamStrength : null;

  const profileImagePath = cleanString(body.profileImagePath, 500);
  if (!profileImagePath || !(profileImagePath.startsWith("/objects/") || /^\/api\/storage\//i.test(profileImagePath))) {
    return res.status(400).json({ error: "Please upload the account profile picture" });
  }
  const galleryPaths = cleanGallery(body.galleryPaths);
  if (!galleryPaths || galleryPaths.length === 0) {
    return res.status(400).json({ error: "Please upload at least one full account picture" });
  }

  const notes = cleanString(body.notes, 1000);

  try {
    const [submission] = await db
      .insert(shopSellSubmissionsTable)
      .values({
        profileImagePath,
        galleryPaths,
        priceCents: body.priceCents,
        teamStrength,
        konamiIdLinked: Boolean(body.konamiIdLinked),
        googlePlayLinked: Boolean(body.googlePlayLinked),
        gameCenterLinked: Boolean(body.gameCenterLinked),
        phone,
        sellerName,
        sellerDiscord,
        notes,
        status: "pending",
        clientId,
      })
      .returning();

    return res.status(201).json({ submission: toSellSubmissionJson(submission) });
  } catch (error: unknown) {
    req.log.error({ err: error }, "Error creating sell submission");
    return res.status(500).json({ error: "Failed to submit account" });
  }
});

// ─── GET /shop/sell/mine ─────────────────────────────────────────────────────
// The seller tracks their own submissions with their browser's client id.
router.get("/shop/sell/mine", async (req, res) => {
  const clientId = typeof req.query.clientId === "string" ? req.query.clientId : "";
  if (!clientId) {
    return res.json({ submissions: [] });
  }

  try {
    const rows = await db
      .select()
      .from(shopSellSubmissionsTable)
      .where(eq(shopSellSubmissionsTable.clientId, clientId))
      .orderBy(desc(shopSellSubmissionsTable.createdAt))
      .limit(50);

    return res.json({ submissions: rows.map((s) => toSellSubmissionJson(s)) });
  } catch (error: unknown) {
    req.log.error({ err: error }, "Error listing sell submissions for seller");
    return res.status(500).json({ error: "Failed to load submissions" });
  }
});

// ═══════════════════════ WG-SHOP Manager (admin gated) ═══════════════════════

// ─── GET /admin/shop/products ────────────────────────────────────────────────
// All products (published or drafts) with the same filters as the storefront.
router.get("/admin/shop/products", requireShopManager, async (req, res) => {
  try {
    const filters = categoryFilters(req.query);
    const rows = await db
      .select({ product: shopProductsTable, createdByUsername: playersTable.username })
      .from(shopProductsTable)
      .leftJoin(playersTable, eq(shopProductsTable.createdBy, playersTable.id))
      .where(filters.length ? and(...filters) : undefined)
      .orderBy(desc(shopProductsTable.createdAt));

    // Manager view — includes the manager-only Aqoonsi (never public).
    return res.json(
      rows.map((row) => ({
        ...toProductJson(row.product),
        aqoonsiId: row.product.aqoonsiId,
        createdByUsername: row.createdByUsername ?? null,
      })),
    );
  } catch (error: unknown) {
    req.log.error({ err: error }, "Error listing shop products for manager");
    return res.status(500).json({ error: "Failed to load products" });
  }
});

// ─── POST /admin/shop/products ───────────────────────────────────────────────
// Publish a new product. When the manager did not upload a separate profile
// picture, the first gallery image becomes the profile picture / card image.
router.post("/admin/shop/products", requireShopManager, async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;

  if (!isShopCategory(body.category)) {
    return res.status(400).json({ error: "category must be efootball, coins or nitro" });
  }

  let subcategory: string | null = null;
  if (body.category === "efootball") {
    if (!isEfootballTier(body.subcategory)) {
      return res.status(400).json({ error: "subcategory must be cheap, medium or expensive" });
    }
    subcategory = body.subcategory;
  }

  const title = cleanString(body.title, 120);
  if (!title) return res.status(400).json({ error: "Title is required" });

  if (!isPositiveInt(body.priceCents)) {
    return res.status(400).json({ error: "A price greater than zero is required" });
  }

  const galleryPaths = cleanGallery(body.galleryPaths);
  if (galleryPaths === null) {
    return res.status(400).json({ error: "Invalid gallery image paths" });
  }

  const profileImagePath =
    typeof body.profileImagePath === "string" && body.profileImagePath.trim()
      ? body.profileImagePath.trim().slice(0, 500)
      : (galleryPaths[0] ?? null);

  const description = cleanString(body.description, 2000) ?? "";

  let teamStrength: number | null = null;
  if (body.teamStrength !== undefined && body.teamStrength !== null && body.teamStrength !== "") {
    if (!isPositiveInt(body.teamStrength)) {
      return res.status(400).json({ error: "Team strength must be a positive number" });
    }
    teamStrength = body.teamStrength;
  }

  const coinAmount = body.category === "coins" ? cleanString(body.coinAmount, 60) : null;
  const nitroPlan = body.category === "nitro" ? cleanString(body.nitroPlan, 60) : null;

  try {
    const [product] = await db
      .insert(shopProductsTable)
      .values({
        category: body.category,
        subcategory,
        title,
        description,
        priceCents: body.priceCents,
        profileImagePath,
        galleryPaths,
        teamStrength,
        coinAmount,
        nitroPlan,
        konamiIdLinked: Boolean(body.konamiIdLinked),
        googlePlayLinked: Boolean(body.googlePlayLinked),
        gameCenterLinked: Boolean(body.gameCenterLinked),
        published: body.published === undefined ? true : Boolean(body.published),
        createdBy: req.session?.userId ?? null,
      })
      .returning();

    return res.status(201).json(toManagerProductJson(product));
  } catch (error: unknown) {
    req.log.error({ err: error }, "Error creating shop product");
    return res.status(500).json({ error: "Failed to create product" });
  }
});

// ─── PATCH /admin/shop/products/:id ──────────────────────────────────────────
// Partial update: edit fields, publish/unpublish, reorder the gallery.
router.patch("/admin/shop/products/:id", requireShopManager, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "Invalid product id" });
  }

  const body = (req.body ?? {}) as Record<string, unknown>;

  try {
    const [existing] = await db.select().from(shopProductsTable).where(eq(shopProductsTable.id, id));
    if (!existing) return res.status(404).json({ error: "Product not found" });

    const updates: Partial<typeof shopProductsTable.$inferInsert> = { updatedAt: new Date() };

    if (body.title !== undefined) {
      const title = cleanString(body.title, 120);
      if (!title) return res.status(400).json({ error: "Title is required" });
      updates.title = title;
    }
    if (body.description !== undefined) {
      updates.description = cleanString(body.description, 2000) ?? "";
    }
    if (body.priceCents !== undefined) {
      if (!isPositiveInt(body.priceCents)) {
        return res.status(400).json({ error: "A price greater than zero is required" });
      }
      updates.priceCents = body.priceCents;
    }
    if (body.galleryPaths !== undefined) {
      const galleryPaths = cleanGallery(body.galleryPaths);
      if (galleryPaths === null) {
        return res.status(400).json({ error: "Invalid gallery image paths" });
      }
      updates.galleryPaths = galleryPaths;
      // The profile picture is always the first image unless the manager
      // explicitly set a dedicated one in the same request.
      if (body.profileImagePath === undefined) {
        updates.profileImagePath = galleryPaths[0] ?? null;
      }
    }
    if (body.profileImagePath !== undefined) {
      updates.profileImagePath =
        typeof body.profileImagePath === "string" && body.profileImagePath.trim()
          ? body.profileImagePath.trim().slice(0, 500)
          : null;
    }
    if (body.teamStrength !== undefined) {
      if (body.teamStrength === null || body.teamStrength === "") {
        updates.teamStrength = null;
      } else if (!isPositiveInt(body.teamStrength)) {
        return res.status(400).json({ error: "Team strength must be a positive number" });
      } else {
        updates.teamStrength = body.teamStrength;
      }
    }
    if (body.coinAmount !== undefined) {
      updates.coinAmount = cleanString(body.coinAmount, 60);
    }
    if (body.nitroPlan !== undefined) {
      updates.nitroPlan = cleanString(body.nitroPlan, 60);
    }
    if (body.konamiIdLinked !== undefined) updates.konamiIdLinked = Boolean(body.konamiIdLinked);
    if (body.googlePlayLinked !== undefined) updates.googlePlayLinked = Boolean(body.googlePlayLinked);
    if (body.gameCenterLinked !== undefined) updates.gameCenterLinked = Boolean(body.gameCenterLinked);
    if (body.published !== undefined) updates.published = Boolean(body.published);

    const [product] = await db
      .update(shopProductsTable)
      .set(updates)
      .where(eq(shopProductsTable.id, id))
      .returning();

    return res.json(toManagerProductJson(product));
  } catch (error: unknown) {
    req.log.error({ err: error }, "Error updating shop product");
    return res.status(500).json({ error: "Failed to update product" });
  }
});

// ─── DELETE /admin/shop/products/:id ─────────────────────────────────────────
router.delete("/admin/shop/products/:id", requireShopManager, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "Invalid product id" });
  }

  try {
    const [deleted] = await db
      .delete(shopProductsTable)
      .where(eq(shopProductsTable.id, id))
      .returning({ id: shopProductsTable.id });
    if (!deleted) return res.status(404).json({ error: "Product not found" });
    // Orders keep their snapshot fields (product_id is SET NULL in the DB).
    return res.json({ ok: true });
  } catch (error: unknown) {
    req.log.error({ err: error }, "Error deleting shop product");
    return res.status(500).json({ error: "Failed to delete product" });
  }
});

// ─── GET /admin/shop/orders ──────────────────────────────────────────────────
// Every customer order (the manager's "My Orders" page) with an optional
// ?status= filter.
router.get("/admin/shop/orders", requireShopManager, async (req, res) => {
  const statusFilter = typeof req.query.status === "string" ? req.query.status : "";
  if (statusFilter && !isOrderStatus(statusFilter)) {
    return res.status(400).json({ error: "Invalid status filter" });
  }

  try {
    const rows = await db
      .select()
      .from(shopOrdersTable)
      .where(statusFilter ? eq(shopOrdersTable.status, statusFilter) : undefined)
      .orderBy(desc(shopOrdersTable.createdAt))
      .limit(200);

    return res.json({ orders: rows.map(toOrderJson) });
  } catch (error: unknown) {
    req.log.error({ err: error }, "Error listing shop orders for manager");
    return res.status(500).json({ error: "Failed to load orders" });
  }
});

// ─── PATCH /admin/shop/orders/:id/status ─────────────────────────────────────
router.patch("/admin/shop/orders/:id/status", requireShopManager, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "Invalid order id" });
  }

  const status = (req.body as { status?: unknown } | undefined)?.status;
  if (!isOrderStatus(status)) {
    return res.status(400).json({ error: "status must be pending, processing, completed or cancelled" });
  }

  try {
    const [order] = await db
      .update(shopOrdersTable)
      .set({ status, updatedAt: new Date() })
      .where(eq(shopOrdersTable.id, id))
      .returning();

    if (!order) return res.status(404).json({ error: "Order not found" });

    // Moving an order to Processing automatically opens its private chat
    // between the customer and the WG-SHOP Manager.
    if (status === "processing") {
      const [existingChat] = await db
        .select({ id: shopOrderChatsTable.id })
        .from(shopOrderChatsTable)
        .where(eq(shopOrderChatsTable.orderId, order.id));
      if (!existingChat) {
        await db.insert(shopOrderChatsTable).values({ orderId: order.id });
      }
    }

    return res.json(toOrderJson(order));
  } catch (error: unknown) {
    req.log.error({ err: error }, "Error updating shop order status");
    return res.status(500).json({ error: "Failed to update order status" });
  }
});

// ─── GET /admin/shop/sell-logs ───────────────────────────────────────────────
// Sell Your Account submissions (manager only) with an optional ?status=
// filter. Includes the Aqoonsi and the published product id — these fields
// are stripped from every public/seller response.
router.get("/admin/shop/sell-logs", requireShopManager, async (req, res) => {
  const statusFilter = typeof req.query.status === "string" ? req.query.status : "";
  if (statusFilter && statusFilter !== "pending" && statusFilter !== "approved" && statusFilter !== "rejected") {
    return res.status(400).json({ error: "Invalid status filter" });
  }

  try {
    const rows = await db
      .select()
      .from(shopSellSubmissionsTable)
      .where(statusFilter ? eq(shopSellSubmissionsTable.status, statusFilter) : undefined)
      .orderBy(desc(shopSellSubmissionsTable.createdAt))
      .limit(200);

    return res.json({ submissions: rows.map((s) => toSellSubmissionJson(s, true)) });
  } catch (error: unknown) {
    req.log.error({ err: error }, "Error listing sell submissions for manager");
    return res.status(500).json({ error: "Failed to load sell logs" });
  }
});

// ─── PATCH /admin/shop/sell-logs/:id/approve ─────────────────────────────────
// Approve a submission. The manager enters the account's Aqoonsi (ID number)
// and picks exactly one category (Cheap / Normal / Expensive). This creates a
// published eFootball product in the chosen tier and links it to the
// submission. The Aqoonsi is stored only on manager-visible records.
router.patch("/admin/shop/sell-logs/:id/approve", requireShopManager, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "Invalid submission id" });
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const aqoonsiId = cleanString(body.aqoonsiId, 60);
  if (!aqoonsiId) {
    return res.status(400).json({ error: "The Aqoonsi (account ID) is required" });
  }
  if (!isEfootballTier(body.subcategory)) {
    return res.status(400).json({ error: "Pick a category: Cheap, Normal or Expensive" });
  }

  try {
    const [submission] = await db
      .select()
      .from(shopSellSubmissionsTable)
      .where(eq(shopSellSubmissionsTable.id, id));
    if (!submission) {
      return res.status(404).json({ error: "Submission not found" });
    }
    if (submission.status !== "pending") {
      return res.status(409).json({ error: `This submission was already ${submission.status}` });
    }

    // Neutral, PII-free public title/description built from the account facts
    // only — the seller's name/phone/Discord and notes stay in Sell Logs.
    const title = `eFootball Account #${submission.id}`;
    const description = [
      submission.teamStrength !== null ? `Team Strength: ${submission.teamStrength.toLocaleString()}` : null,
      `Konami ID Linked: ${submission.konamiIdLinked ? "Yes" : "No"}`,
      `Google Play Account: ${submission.googlePlayLinked ? "Yes" : "No"}`,
      `Game Center: ${submission.gameCenterLinked ? "Yes" : "No"}`,
      "Verified and published by the WG-SHOP team.",
    ]
      .filter(Boolean)
      .join("\n");

    const [product] = await db
      .insert(shopProductsTable)
      .values({
        category: "efootball",
        subcategory: body.subcategory,
        title,
        description,
        priceCents: submission.priceCents,
        profileImagePath: submission.profileImagePath,
        galleryPaths: submission.galleryPaths ?? [],
        teamStrength: submission.teamStrength,
        konamiIdLinked: submission.konamiIdLinked,
        googlePlayLinked: submission.googlePlayLinked,
        gameCenterLinked: submission.gameCenterLinked,
        aqoonsiId,
        published: true,
        createdBy: req.session?.userId ?? null,
      })
      .returning();

    const [updated] = await db
      .update(shopSellSubmissionsTable)
      .set({ status: "approved", aqoonsiId, publishedProductId: product.id, updatedAt: new Date() })
      .where(eq(shopSellSubmissionsTable.id, id))
      .returning();

    return res.json({ submission: toSellSubmissionJson(updated, true), product: toProductJson(product) });
  } catch (error: unknown) {
    req.log.error({ err: error }, "Error approving sell submission");
    return res.status(500).json({ error: "Failed to approve submission" });
  }
});

// ─── PATCH /admin/shop/sell-logs/:id/reject ──────────────────────────────────
// Reject a submission with an optional reason the seller can read.
router.patch("/admin/shop/sell-logs/:id/reject", requireShopManager, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "Invalid submission id" });
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const rejectionReason = cleanString(body.reason, 500);

  try {
    const [updated] = await db
      .update(shopSellSubmissionsTable)
      .set({ status: "rejected", rejectionReason, updatedAt: new Date() })
      .where(and(eq(shopSellSubmissionsTable.id, id), eq(shopSellSubmissionsTable.status, "pending")))
      .returning();

    if (!updated) {
      return res.status(409).json({ error: "Submission not found or already reviewed" });
    }
    return res.json({ submission: toSellSubmissionJson(updated, true) });
  } catch (error: unknown) {
    req.log.error({ err: error }, "Error rejecting sell submission");
    return res.status(500).json({ error: "Failed to reject submission" });
  }
});

export default router;




