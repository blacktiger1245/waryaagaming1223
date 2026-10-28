import { apiUrl } from "./api";

export interface CoinPackage {
  id: string;
  coins: number;
  priceUsd: number;
  label: string;
  price: string;
}

export interface CoinTransaction {
  id: number;
  packageId: string;
  coins: number;
  priceUsd: number;
  createdAt: string | null;
}

/**
 * Whether a Stripe Checkout Session has already been credited to the signed-in
 * player. Coins are credited by the Stripe webhook, so the browser asks the
 * server about the session it paid for instead of guessing from the balance.
 */
export interface CheckoutSessionStatus {
  sessionId: string;
  credited: boolean;
  /** Coins credited for this session — present once `credited` is true. */
  coins?: number;
  packageId?: string;
  creditedAt?: string | null;
  /** Server-side balance at the moment of the check. */
  balance?: number | null;
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (typeof init?.body === "string" && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const res = await fetch(apiUrl(path), { credentials: "include", ...init, headers });
  const text = await res.text();
  let data: any = {};
  if (text) { try { data = JSON.parse(text); } catch { /* non-JSON body */ } }
  if (!res.ok) throw new Error(data?.error ?? `Request failed (${res.status})`);
  return data as T;
}

export const coins = {
  balance: () => req<{ balance: number }>("/api/coins/balance"),
  packages: () => req<{ packages: CoinPackage[] }>("/api/coins/packages"),
  transactions: () => req<{ transactions: CoinTransaction[] }>("/api/coins/transactions"),
  /**
   * Starts a hosted Stripe Checkout Session for a coin package. The returned
   * `url` is Stripe's payment page — redirect the browser to it. Coins are
   * credited by the Stripe webhook once the payment succeeds, never here.
   */
  createCheckoutSession: (packageId: string) =>
    req<{ url: string; sessionId: string }>("/api/payments/create-checkout-session", {
      method: "POST",
      body: JSON.stringify({ packageId }),
    }),
  /**
   * Whether the given Checkout Session has already been credited to the
   * signed-in player. Only the caller's own sessions are ever reported as
   * credited. Read-only, so polling it is safe.
   */
  checkoutSessionStatus: (sessionId: string) =>
    req<CheckoutSessionStatus>(`/api/payments/checkout-session/${encodeURIComponent(sessionId)}`),
};

export function formatCoins(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1)}K`;
  return n.toLocaleString();
}