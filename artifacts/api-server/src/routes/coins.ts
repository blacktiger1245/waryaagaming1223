import { Router, type Request, type Response } from "express";
import { db, coinTransactionsTable, playersTable } from "@workspace/db";
import { eq, desc, sql } from "drizzle-orm";

const router = Router();

/**
 * Coin packages — "m" means million coins.
 * 5m = $1, 30m = $5, 70m = $10, 100m = $20.
 */
export const COIN_PACKAGES = [
  { id: "coins-5m", coins: 5_000_000, priceUsd: 1 },
  { id: "coins-30m", coins: 30_000_000, priceUsd: 5 },
  { id: "coins-70m", coins: 70_000_000, priceUsd: 10 },
  { id: "coins-100m", coins: 100_000_000, priceUsd: 20 },
] as const;

function packageJson(p: (typeof COIN_PACKAGES)[number]) {
  return { ...p, label: `${p.coins / 1_000_000}M Coins`, price: `$${p.priceUsd}` };
}

// ── GET /coins/packages ──────────────────────────────────────────────────────
router.get("/coins/packages", (_req: Request, res: Response) => {
  res.json({ packages: COIN_PACKAGES.map(packageJson) });
});

// ── GET /coins/balance ───────────────────────────────────────────────────────
router.get("/coins/balance", async (req: Request, res: Response) => {
  const me = req.session?.userId;
  if (!me) { res.status(401).json({ error: "Login required" }); return; }

  const [player] = await db
    .select({ coinBalance: playersTable.coinBalance })
    .from(playersTable)
    .where(eq(playersTable.id, me));
  if (!player) { res.status(404).json({ error: "Player not found" }); return; }

  res.json({ balance: player.coinBalance });
});

// ── GET /coins/transactions ──────────────────────────────────────────────────
router.get("/coins/transactions", async (req: Request, res: Response) => {
  const me = req.session?.userId;
  if (!me) { res.status(401).json({ error: "Login required" }); return; }

  const rows = await db
    .select()
    .from(coinTransactionsTable)
    .where(eq(coinTransactionsTable.playerId, me))
    .orderBy(desc(coinTransactionsTable.createdAt))
    .limit(50);

  res.json({
    transactions: rows.map((t) => ({
      id: t.id,
      packageId: t.packageId,
      coins: t.coins,
      priceUsd: t.priceUsd,
      createdAt: t.createdAt?.toISOString() ?? null,
    })),
  });
});

// ── POST /coins/purchase ─────────────────────────────────────────────────────
// NOTE: There is no real payment gateway wired into this project yet, so this
// endpoint performs a *simulated* purchase: it credits the coins immediately
// and records the transaction. Hook a real provider (Stripe/PayPal/…) in here
// before going live with real money.
router.post("/coins/purchase", async (req: Request, res: Response) => {
  const me = req.session?.userId;
  if (!me) { res.status(401).json({ error: "Login required" }); return; }

  const body = (req.body ?? {}) as { packageId?: unknown };
  const packageId = typeof body.packageId === "string" ? body.packageId : "";
  const pkg = COIN_PACKAGES.find((p) => p.id === packageId);
  if (!pkg) { res.status(400).json({ error: "Invalid coin package" }); return; }

  const [updated] = await db
    .update(playersTable)
    .set({ coinBalance: sql`${playersTable.coinBalance} + ${pkg.coins}` })
    .where(eq(playersTable.id, me))
    .returning({ coinBalance: playersTable.coinBalance });
  if (!updated) { res.status(404).json({ error: "Player not found" }); return; }

  const [tx] = await db
    .insert(coinTransactionsTable)
    .values({ playerId: me, packageId: pkg.id, coins: pkg.coins, priceUsd: pkg.priceUsd })
    .returning();

  res.status(201).json({
    ok: true,
    balance: updated.coinBalance,
    purchased: { coins: pkg.coins, priceUsd: pkg.priceUsd },
    transactionId: tx.id,
  });
});

export default router;