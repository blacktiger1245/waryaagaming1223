import { apiFetch, apiUrl } from "@/lib/api";

// ─── Types (mirror artifacts/api-server/src/routes/shop.ts) ──────────────────
export type ShopCategory = "efootball" | "coins" | "nitro";
export type EfootballTier = "cheap" | "medium" | "expensive";
export type ShopOrderStatus = "pending" | "processing" | "completed" | "cancelled";

export interface ShopProduct {
  id: number;
  category: ShopCategory;
  subcategory: EfootballTier | null;
  title: string;
  description: string;
  priceCents: number;
  webFeeCents: number;
  totalPriceCents: number;
  profileImagePath: string | null;
  galleryPaths: string[];
  teamStrength: number | null;
  coinAmount: string | null;
  nitroPlan: string | null;
  konamiIdLinked: boolean;
  googlePlayLinked: boolean;
  gameCenterLinked: boolean;
  published: boolean;
  createdAt: string;
  updatedAt: string;
  createdByUsername?: string | null;
}

export interface ShopOrder {
  id: number;
  productId: number | null;
  productTitle: string;
  category: ShopCategory;
  priceCents: number;
  webFeeCents: number;
  totalPriceCents: number;
  buyerName: string;
  buyerContact: string;
  buyerPhone: string | null;
  buyerDiscord: string | null;
  productImagePath: string | null;
  note: string | null;
  status: ShopOrderStatus;
  clientId: string;
  createdAt: string;
  updatedAt: string;
}

export interface ShopOrderChat {
  id: number;
  orderId: number;
  status: "open" | "closed";
  createdAt: string;
  updatedAt: string;
}

export interface ShopChatMessage {
  id: number;
  chatId: number;
  senderRole: "customer" | "manager";
  senderName: string;
  body: string | null;
  imagePath: string | null;
  createdAt: string;
}

export interface ManagerOrderChatSummary {
  chatId: number;
  orderId: number;
  orderStatus: ShopOrderStatus;
  buyerName: string;
  productTitle: string;
  priceCents: number;
  updatedAt: string;
}

/** Manager product = public product + the manager-only Aqoonsi (never public). */
export interface ManagerShopProduct extends ShopProduct {
  aqoonsiId: string | null;
}

export type ShopSellStatus = "pending" | "approved" | "rejected";

export interface ShopSellSubmission {
  id: number;
  profileImagePath: string | null;
  galleryPaths: string[];
  priceCents: number;
  teamStrength: number | null;
  konamiIdLinked: boolean;
  googlePlayLinked: boolean;
  gameCenterLinked: boolean;
  phone: string;
  sellerName: string;
  sellerDiscord: string;
  notes: string | null;
  status: ShopSellStatus;
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Manager Sell Logs entry = seller view + the manager-only Aqoonsi fields. */
export interface ManagerShopSellSubmission extends ShopSellSubmission {
  aqoonsiId: string | null;
  publishedProductId: number | null;
}

export interface NewShopProduct {
  category: ShopCategory;
  subcategory?: EfootballTier | null;
  title: string;
  description?: string;
  priceCents: number;
  profileImagePath?: string | null;
  galleryPaths?: string[];
  teamStrength?: number | null;
  coinAmount?: string | null;
  nitroPlan?: string | null;
  konamiIdLinked?: boolean;
  googlePlayLinked?: boolean;
  gameCenterLinked?: boolean;
  published?: boolean;
}

// ─── Category metadata (neon accent per category) ────────────────────────────
export const SHOP_CATEGORY_META: Record<
  ShopCategory,
  { label: string; tagline: string; accent: string; accentSoft: string; glow: string }
> = {
  efootball: {
    label: "eFootball",
    tagline: "Ready-to-play accounts in three tiers",
    accent: "#22c55e",
    accentSoft: "rgba(34,197,94,0.12)",
    glow: "0 0 24px rgba(34,197,94,0.35)",
  },
  coins: {
    label: "Coins",
    tagline: "Top up your WG balance instantly",
    accent: "#eab308",
    accentSoft: "rgba(234,179,8,0.12)",
    glow: "0 0 24px rgba(234,179,8,0.35)",
  },
  nitro: {
    label: "Discord Nitro",
    tagline: "Boost your Discord with Nitro plans",
    accent: "#5865F2",
    accentSoft: "rgba(88,101,242,0.14)",
    glow: "0 0 24px rgba(88,101,242,0.4)",
  },
};

export const EFOOTBALL_TIER_META: Record<EfootballTier, { label: string; blurb: string }> = {
  cheap: { label: "Cheap Accounts", blurb: "Budget-friendly starter accounts" },
  medium: { label: "Medium Accounts", blurb: "Solid squads for serious play" },
  expensive: { label: "Expensive Accounts", blurb: "Elite teams with top ratings" },
};

export const SHOP_ORDER_STATUS_META: Record<ShopOrderStatus, { label: string; className: string }> = {
  pending: { label: "Pending", className: "bg-yellow-500/15 text-yellow-400 border-yellow-500/40" },
  processing: { label: "Processing", className: "bg-blue-500/15 text-blue-400 border-blue-500/40" },
  completed: { label: "Completed", className: "bg-green-500/15 text-green-400 border-green-500/40" },
  cancelled: { label: "Cancelled", className: "bg-red-500/15 text-red-400 border-red-500/40" },
};

export const SHOP_SELL_STATUS_META: Record<ShopSellStatus, { label: string; className: string }> = {
  pending: { label: "Pending Review", className: "bg-yellow-500/15 text-yellow-400 border-yellow-500/40" },
  approved: { label: "Approved", className: "bg-green-500/15 text-green-400 border-green-500/40" },
  rejected: { label: "Rejected", className: "bg-red-500/15 text-red-400 border-red-500/40" },
};

// ─── Formatting helpers ──────────────────────────────────────────────────────
export function formatPrice(cents: number): string {
  const dollars = cents / 100;
  return Number.isInteger(dollars) ? `$${dollars}` : `$${dollars.toFixed(2)}`;
}

/**
 * Client-side mirror of the server's Web Fee formula, used only for live
 * preview in the admin form. The server always recomputes the real fee before
 * saving, so this value can never be trusted for pricing.
 *
 *   Web Fee = ceil(Product Price / $20) × $2   →   ceil(priceCents / 2000) × 200
 */
export function calculateWebFeeCents(priceCents: number): number {
  return Math.ceil(priceCents / 2000) * 200;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

/** Guest identity for orders (the storefront has no login UI by design). */
export function getShopClientId(): string {
  const KEY = "wg_shop_client_id";
  let id = localStorage.getItem(KEY) ?? "";
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(id)) {
    const random =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    id = random.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40);
    localStorage.setItem(KEY, id);
  }
  return id;
}

// ─── API calls ───────────────────────────────────────────────────────────────
export async function fetchShopProducts(filters?: {
  category?: ShopCategory;
  subcategory?: EfootballTier;
}): Promise<ShopProduct[]> {
  const params = new URLSearchParams();
  if (filters?.category) params.set("category", filters.category);
  if (filters?.subcategory) params.set("subcategory", filters.subcategory);
  const qs = params.toString();
  const data = await apiFetch<{ products: ShopProduct[] }>(`/api/shop/products${qs ? `?${qs}` : ""}`);
  return data.products;
}

export async function fetchShopProduct(id: number): Promise<ShopProduct> {
  const data = await apiFetch<{ product: ShopProduct }>(`/api/shop/products/${id}`);
  return data.product;
}

export async function fetchMyShopOrders(): Promise<ShopOrder[]> {
  const data = await apiFetch<{ orders: ShopOrder[] }>(
    `/api/shop/orders?clientId=${encodeURIComponent(getShopClientId())}`,
  );
  return data.orders;
}

export async function placeShopOrder(input: {
  productId: number;
  buyerName: string;
  buyerPhone: string;
  buyerDiscord: string;
  note?: string;
}): Promise<ShopOrder> {
  const data = await apiFetch<{ order: ShopOrder }>("/api/shop/orders", {
    method: "POST",
    body: JSON.stringify({ ...input, clientId: getShopClientId() }),
  });
  return data.order;
}

// ═══════════════════ Order chat (customer ↔ manager) ════════════════════════

export async function fetchOrderChat(orderId: number): Promise<{
  chat: ShopOrderChat;
  order: ShopOrder;
  messages: ShopChatMessage[];
  viewer: "customer" | "manager";
}> {
  return apiFetch(
    `/api/shop/orders/${orderId}/chat?clientId=${encodeURIComponent(getShopClientId())}`,
  );
}

export async function sendChatMessage(orderId: number, body: string): Promise<ShopChatMessage> {
  const data = await apiFetch<{ message: ShopChatMessage }>(`/api/shop/orders/${orderId}/chat/messages`, {
    method: "POST",
    body: JSON.stringify({ body, clientId: getShopClientId() }),
  });
  return data.message;
}

export async function deleteOrderChat(orderId: number): Promise<void> {
  await apiFetch(`/api/shop/orders/${orderId}/chat`, { method: "DELETE" });
}

/**
 * Ask the server to generate the transcript PNG for this order and post it to
 * the order chat. The request payload stays tiny (just the URL order id) — the
 * PNG is rendered SERVER-SIDE from the database and uploaded to object
 * storage there, so no large base64 image ever travels through the API.
 */
export async function generateOrderTranscript(orderId: number): Promise<ShopChatMessage> {
  const data = await apiFetch<{ message: ShopChatMessage }>(`/api/shop/orders/${orderId}/chat/transcript`, {
    method: "POST",
    body: JSON.stringify({}),
  });
  return data.message;
}

export async function fetchManagerChats(): Promise<ManagerOrderChatSummary[]> {
  const data = await apiFetch<{ chats: ManagerOrderChatSummary[] }>("/api/admin/shop/chats");
  return data.chats;
}

// ─── Manager endpoints (the server enforces the WG-SHOP Manager role) ───────
export async function fetchManagerProducts(filters?: {
  category?: ShopCategory;
  subcategory?: EfootballTier;
}): Promise<ManagerShopProduct[]> {
  const params = new URLSearchParams();
  if (filters?.category) params.set("category", filters.category);
  if (filters?.subcategory) params.set("subcategory", filters.subcategory);
  const qs = params.toString();
  return apiFetch<ManagerShopProduct[]>(`/api/admin/shop/products${qs ? `?${qs}` : ""}`);
}

export async function createManagerProduct(input: NewShopProduct): Promise<ManagerShopProduct> {
  return apiFetch<ManagerShopProduct>("/api/admin/shop/products", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateManagerProduct(
  id: number,
  patch: Partial<NewShopProduct>,
): Promise<ManagerShopProduct> {
  return apiFetch<ManagerShopProduct>(`/api/admin/shop/products/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export async function deleteManagerProduct(id: number): Promise<void> {
  await apiFetch(`/api/admin/shop/products/${id}`, { method: "DELETE" });
}

export async function fetchManagerOrders(status?: ShopOrderStatus): Promise<ShopOrder[]> {
  const data = await apiFetch<{ orders: ShopOrder[] }>(
    `/api/admin/shop/orders${status ? `?status=${status}` : ""}`,
  );
  return data.orders;
}

export async function updateManagerOrderStatus(id: number, status: ShopOrderStatus): Promise<ShopOrder> {
  return apiFetch<ShopOrder>(`/api/admin/shop/orders/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

/**
 * Upload a shop image through the admin-gated API endpoint (server → R2).
 * Returns the canonical `/objects/...` path stored on products.
 */
export async function uploadShopImage(file: File): Promise<string> {
  const response = await fetch(apiUrl("/api/storage/uploads/direct"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": file.type || "image/png" },
    body: file,
  });
  const data = (await response.json().catch(() => ({}))) as { objectPath?: string; error?: string };
  if (!response.ok) throw new Error(data.error ?? "Failed to upload image");
  if (!data.objectPath) throw new Error("The upload did not return a file path");
  return data.objectPath;
}

// ═══════════════════ Sell Your Account ══════════════════════════════════════

/**
 * Upload a seller image through the public (non-admin) endpoint. Returns the
 * canonical `/objects/...` path stored on the submission.
 */
export async function uploadSellImage(file: File): Promise<string> {
  const response = await fetch(apiUrl("/api/shop/sell/uploads"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": file.type || "image/png" },
    body: file,
  });
  const data = (await response.json().catch(() => ({}))) as { objectPath?: string; error?: string };
  if (!response.ok) throw new Error(data.error ?? "Failed to upload image");
  if (!data.objectPath) throw new Error("The upload did not return a file path");
  return data.objectPath;
}

export async function submitSellAccount(input: {
  profileImagePath: string;
  galleryPaths: string[];
  priceCents: number;
  teamStrength: number | null;
  konamiIdLinked: boolean;
  googlePlayLinked: boolean;
  gameCenterLinked: boolean;
  phone: string;
  sellerName: string;
  sellerDiscord: string;
  notes?: string;
}): Promise<ShopSellSubmission> {
  const data = await apiFetch<{ submission: ShopSellSubmission }>("/api/shop/sell", {
    method: "POST",
    body: JSON.stringify({ ...input, clientId: getShopClientId() }),
  });
  return data.submission;
}

export async function fetchMySellSubmissions(): Promise<ShopSellSubmission[]> {
  const data = await apiFetch<{ submissions: ShopSellSubmission[] }>(
    `/api/shop/sell/mine?clientId=${encodeURIComponent(getShopClientId())}`,
  );
  return data.submissions;
}

// ─── Manager Sell Logs (the server enforces the WG-SHOP Manager role) ───────
export async function fetchSellLogs(status?: ShopSellStatus): Promise<ManagerShopSellSubmission[]> {
  const data = await apiFetch<{ submissions: ManagerShopSellSubmission[] }>(
    `/api/admin/shop/sell-logs${status ? `?status=${status}` : ""}`,
  );
  return data.submissions;
}

export async function approveSellSubmission(
  id: number,
  input: { aqoonsiId: string; subcategory: EfootballTier },
): Promise<{ submission: ManagerShopSellSubmission; product: ShopProduct }> {
  return apiFetch(`/api/admin/shop/sell-logs/${id}/approve`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function rejectSellSubmission(id: number, reason?: string): Promise<ManagerShopSellSubmission> {
  const data = await apiFetch<{ submission: ManagerShopSellSubmission }>(
    `/api/admin/shop/sell-logs/${id}/reject`,
    {
      method: "PATCH",
      body: JSON.stringify({ reason }),
    },
  );
  return data.submission;
}


