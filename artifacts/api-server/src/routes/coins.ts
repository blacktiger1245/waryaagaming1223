import { Router, type Request, type Response } from "express";
import { db, coinTransactionsTable, coinSpendsTable, playersTable, teamsTable } from "@workspace/db";
import { eq, or, sql, desc } from "drizzle-orm";

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

/**
 * The ONLY two things WG Coins can buy.
 *
 * Prices are server-side constants — the client only ever sends an `item` id, so
 * a price can never be dictated by the browser. Buying one grants the matching
 * `players.clan_role` entitlement, which is what allows a player to create a clan
 * (President) or to take a clan's Coach seat. Nothing else in the app accepts
 * coins, and no other endpoint may deduct `players.coin_balance`.
 */
export const CLAN_ROLE_PURCHASES = [
  {
    id: "clan-president",
    clanRole: "president" as const,
    coins: 50_000_000,
    label: "Clan President",
    blurb: "Unlocks creating your own clan — you become its President.",
  },
  {
    id: "clan-coach",
    clanRole: "coach" as const,
    coins: 25_000_000,
    label: "Clan Coach",
    blurb: "Lets you take the Coach seat when a clan invites you.",
  },
] as const;

export type ClanRolePurchase = (typeof CLAN_ROLE_PURCHASES)[number];

function findPurchase(item: unknown): ClanRolePurchase | null {
  return CLAN_ROLE_PURCHASES.find((p) => p.id === item) ?? null;
}

/** Error carrying an HTTP status, thrown inside the purchase transaction. */
function httpError(status: number, message: string): Error {
  const err = new Error(message) as Error & { status?: number };
  err.status = status;
  return err;
}

/**
 * Why this player may NOT buy a clan role right now, or null when they may.
 *
 * "Not everybody can buy it": a player must be clan-less (one clan per player),
 * must not already lead a clan, and must not already hold an entitlement. The
 * balance check happens under a row lock so two taps cannot both pass.
 */
function purchaseBlockReason(
  player: { clanRole: string | null; teamId: number | null },
  alreadyLeadsClan: boolean,
  balance: number,
  price: number,
): string | null {
  if (player.clanRole) {
    const held = CLAN_ROLE_PURCHASES.find((p) => p.clanRole === player.clanRole);
    return `You already hold the ${held?.label ?? player.clanRole} role.`;
  }
  if (player.teamId != null) return "You are already in a clan — leave it before buying a clan role.";
  if (alreadyLeadsClan) return "You already lead a clan.";
  if (balance < price) return "Not enough WG Coins for this role.";
  return null;
}

// ── GET /coins/clan-roles ────────────────────────────────────────────────────
// The catalogue of the two coin-purchasable clan roles, plus the caller's own
// eligibility so the UI can explain exactly why the buttons are disabled.
router.get("/coins/clan-roles", async (req: Request, res: Response) => {
  const me = req.session?.userId;

  if (!me) {
    res.json({
      roles: CLAN_ROLE_PURCHASES.map((p) => ({ ...p, affordable: false })),
      balance: null,
      clanRole: null,
      canBuy: false,
      reason: "Login required",
    });
    return;
  }

  const [player] = await db
    .select({ coinBalance: playersTable.coinBalance, clanRole: playersTable.clanRole, teamId: playersTable.teamId })
    .from(playersTable)
    .where(eq(playersTable.id, me));
  if (!player) { res.status(404).json({ error: "Player not found" }); return; }

  const [led] = await db
    .select({ id: teamsTable.id })
    .from(teamsTable)
    .where(or(eq(teamsTable.presidentId, me), eq(teamsTable.coachId, me)))
    .limit(1);

  const balance = player.coinBalance;
  res.json({
    roles: CLAN_ROLE_PURCHASES.map((p) => ({ ...p, affordable: balance >= p.coins })),
    balance,
    clanRole: player.clanRole,
    // `canBuy` answers "is anything at all buyable for me right now?" — the
    // per-role `affordable` flag covers the price.
    canBuy: purchaseBlockReason(player, Boolean(led), balance, 0) === null,
    reason: purchaseBlockReason(player, Boolean(led), balance, 0),
  });
});

// ── POST /coins/clan-roles/buy ───────────────────────────────────────────────
// The single coin SPEND in the app. The deduction, the entitlement and the
// `coin_spends` ledger row are written in ONE transaction under a row lock, so a
// balance can never go negative and one player can never hold two clan roles.
router.post("/coins/clan-roles/buy", async (req: Request, res: Response) => {
  const me = req.session?.userId;
  if (!me) { res.status(401).json({ error: "Login required" }); return; }

  const purchase = findPurchase((req.body as { item?: unknown } | null)?.item);
  if (!purchase) {
    res.status(400).json({ error: "WG Coins can only buy a Clan President role or a Clan Coach role" });
    return;
  }

  try {
    const result = await db.transaction(async (tx) => {
      // Lock the player row: concurrent buys serialise here, so the eligibility
      // checks below can never both pass for the same account.
      const locked = await tx.execute(
        sql`SELECT id, coin_balance, clan_role, team_id FROM players WHERE id = ${me} FOR UPDATE`,
      );
      type LockedRow = { id: number; coin_balance: number; clan_role: string | null; team_id: number | null };
      const row = ((locked as unknown as { rows: LockedRow[] }).rows ?? [])[0];
      if (!row) throw httpError(404, "Player not found");

      const [led] = await tx
        .select({ id: teamsTable.id })
        .from(teamsTable)
        .where(or(eq(teamsTable.presidentId, me), eq(teamsTable.coachId, me)))
        .limit(1);

      const reason = purchaseBlockReason(
        { clanRole: row.clan_role, teamId: row.team_id },
        Boolean(led),
        Number(row.coin_balance),
        purchase.coins,
      );
      if (reason) throw httpError(reason.includes("Not enough") ? 402 : 409, reason);

      const [updated] = await tx
        .update(playersTable)
        .set({
          coinBalance: sql`${playersTable.coinBalance} - ${purchase.coins}`,
          clanRole: purchase.clanRole,
        })
        .where(eq(playersTable.id, me))
        .returning({ coinBalance: playersTable.coinBalance });

      await tx.insert(coinSpendsTable).values({ playerId: me, item: purchase.id, coins: purchase.coins });

      return { balance: updated?.coinBalance ?? Number(row.coin_balance) - purchase.coins };
    });

    res.status(201).json({
      ok: true,
      item: purchase.id,
      clanRole: purchase.clanRole,
      coins: purchase.coins,
      balance: result.balance,
    });
  } catch (err) {
    const status = (err as { status?: number }).status ?? 500;
    if (status === 500) console.error("[coins] clan role purchase failed", err);
    res.status(status).json({ error: err instanceof Error ? err.message : "Purchase failed" });
  }
});

// ── GET /coins/eligibility ───────────────────────────────────────────────────
// Whether the signed-in player may buy WG Coins. This is the SAME rule
// `POST /payments/create-checkout-session` enforces (clan President or Coach), so
// the Buy Coins page can never disagree with the API about who may pay — which is
// what made a real clan President see the packages locked.
router.get("/coins/eligibility", async (req: Request, res: Response) => {
  const me = req.session?.userId;
  if (!me) {
    res.json({ canBuyCoins: false, role: null, teamId: null, teamName: null, reason: "Login required" });
    return;
  }

  const [team] = await db
    .select({
      id: teamsTable.id,
      name: teamsTable.name,
      presidentId: teamsTable.presidentId,
      coachId: teamsTable.coachId,
    })
    .from(teamsTable)
    .where(or(eq(teamsTable.presidentId, me), eq(teamsTable.coachId, me)))
    .limit(1);

  if (!team) {
    res.json({
      canBuyCoins: false,
      role: null,
      teamId: null,
      teamName: null,
      reason: "WG Coins can only be bought by a clan President or Coach.",
    });
    return;
  }

  res.json({
    canBuyCoins: true,
    role: team.presidentId === me ? "president" : "coach",
    teamId: team.id,
    teamName: team.name,
    reason: null,
  });
});

// NOTE: Coin top-ups are handled by POST /payments/create-checkout-session and
// the Stripe webhook in ./payments.ts — coins are only credited once Stripe
// confirms the payment. The previous simulated /coins/purchase endpoint was
// removed so a balance can never be topped up without paying.

export default router;