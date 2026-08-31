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
  purchase: (packageId: string) =>
    req<{ ok: boolean; balance: number; purchased: { coins: number; priceUsd: number } }>(
      "/api/coins/purchase",
      { method: "POST", body: JSON.stringify({ packageId }) },
    ),
};

export function formatCoins(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1)}K`;
  return n.toLocaleString();
}