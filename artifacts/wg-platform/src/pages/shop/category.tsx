import { useState } from "react";
import { Link, useLocation, useParams, useSearchParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Gamepad2 } from "lucide-react";
import { ProductCard } from "@/components/shop/product-card";
import { PurchaseDialog } from "@/components/shop/purchase-dialog";
import {
  fetchShopProducts,
  SHOP_CATEGORY_META,
  EFOOTBALL_TIER_META,
  type ShopCategory,
  type EfootballTier,
  type ShopProduct,
} from "@/lib/shop";

const TIERS: EfootballTier[] = ["cheap", "medium", "expensive"];

function isCategory(value: string | undefined): value is ShopCategory {
  return value === "efootball" || value === "coins" || value === "nitro";
}

function isTier(value: string | null): value is EfootballTier {
  return value === "cheap" || value === "medium" || value === "expensive";
}

/**
 * Category page — /shop/category/:category
 * eFootball always shows exactly the three account tiers: Cheap / Medium /
 * Expensive (selected with the ?tier= filter).
 */
export default function ShopCategoryPage() {
  const { category } = useParams<{ category: string }>();
  const [, setLocation] = useLocation();
  const [searchParams] = useSearchParams();
  const tierParam = searchParams.get("tier");
  const activeTier: EfootballTier | null = category === "efootball" && isTier(tierParam) ? tierParam : null;

  const [buyProduct, setBuyProduct] = useState<ShopProduct | null>(null);

  const valid = isCategory(category);
  const meta = valid ? SHOP_CATEGORY_META[category] : null;

  const { data: products, isLoading } = useQuery({
    queryKey: ["shop", "products", category, activeTier],
    queryFn: () =>
      fetchShopProducts(
        valid ? { category, subcategory: activeTier ?? undefined } : undefined,
      ),
    enabled: valid,
  });

  if (!valid || !meta) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <p className="text-lg font-bold">Category not found.</p>
        <Link href="/shop" className="mt-2 inline-block text-sm font-bold text-primary hover:underline">
          Back to WG-SHOP
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div
        className="relative overflow-hidden rounded-2xl border border-border bg-card p-6 sm:p-8"
        style={{ boxShadow: `inset 0 0 80px ${meta.accentSoft}` }}
      >
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">WG-SHOP / Category</p>
        <h1 className="mt-1 text-2xl font-black uppercase tracking-wide sm:text-3xl" style={{ color: meta.accent }}>
          {meta.label}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{meta.tagline}</p>
      </div>

      {/* eFootball tier pills — exactly Cheap / Medium / Expensive */}
      {category === "efootball" ? (
        <div className="mt-6 flex flex-wrap items-center gap-2">
          <span className="mr-1 inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-muted-foreground">
            <Gamepad2 className="h-4 w-4" /> Account tiers
          </span>
          {TIERS.map((tier) => {
            const active = activeTier === tier;
            return (
              <button
                key={tier}
                data-testid={`button-tier-${tier}`}
                onClick={() =>
                  setLocation(active ? "/shop/category/efootball" : `/shop/category/efootball?tier=${tier}`)
                }
                className={`rounded-full border px-4 py-1.5 text-sm font-bold transition-all ${
                  active
                    ? "border-green-500 bg-green-500/15 text-green-400"
                    : "border-border bg-card text-muted-foreground hover:border-green-500/50 hover:text-green-400"
                }`}
              >
                {EFOOTBALL_TIER_META[tier].label}
              </button>
            );
          })}
        </div>
      ) : null}

      {/* Products */}
      {isLoading ? (
        <div className="mt-8 flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading {meta.label}…
        </div>
      ) : !products || products.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed border-border bg-card/50 p-12 text-center text-sm text-muted-foreground">
          {activeTier
            ? `No ${EFOOTBALL_TIER_META[activeTier].label.toLowerCase()} available right now — check back soon!`
            : `No ${meta.label} products published yet — check back soon!`}
        </div>
      ) : (
        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} onBuy={setBuyProduct} />
          ))}
        </div>
      )}

      {buyProduct ? <PurchaseDialog product={buyProduct} onClose={() => setBuyProduct(null)} /> : null}
    </div>
  );
}
