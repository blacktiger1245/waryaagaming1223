import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Gamepad2, Coins as CoinsIcon, Gem, ArrowRight, Sparkles, Loader2 } from "lucide-react";
import { ProductCard } from "@/components/shop/product-card";
import { PurchaseDialog } from "@/components/shop/purchase-dialog";
import {
  fetchShopProducts,
  SHOP_CATEGORY_META,
  type ShopCategory,
  type ShopProduct,
} from "@/lib/shop";

const CATEGORY_ICONS: Record<ShopCategory, typeof Gamepad2> = {
  efootball: Gamepad2,
  coins: CoinsIcon,
  nitro: Gem,
};

const CATEGORIES: ShopCategory[] = ["efootball", "coins", "nitro"];

export default function ShopStorePage() {
  const [buyProduct, setBuyProduct] = useState<ShopProduct | null>(null);

  const { data: products, isLoading } = useQuery({
    queryKey: ["shop", "products", "latest"],
    queryFn: () => fetchShopProducts(),
  });

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-2xl border border-border bg-card p-8 sm:p-12">
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            background:
              "radial-gradient(600px 300px at 20% 0%, rgba(88,101,242,0.25), transparent), radial-gradient(500px 260px at 85% 100%, rgba(34,197,94,0.18), transparent), radial-gradient(400px 220px at 60% 20%, rgba(234,179,8,0.12), transparent)",
          }}
          aria-hidden
        />
        <div className="relative">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs font-bold uppercase tracking-widest text-primary">
            <Sparkles className="h-3.5 w-3.5" /> Waryaa Gaming Official Store
          </span>
          <h1 className="mt-4 text-3xl font-black uppercase tracking-wide text-foreground sm:text-5xl">
            Level up your game with <span className="text-primary wg-brand-glow">WG-SHOP</span>
          </h1>
          <p className="mt-3 max-w-xl text-sm text-muted-foreground sm:text-base">
            Premium eFootball accounts, instant coin top-ups and Discord Nitro — hand-delivered by the WG team with
            fast, trusted service.
          </p>
        </div>
      </section>

      {/* Categories */}
      <section className="mt-8">
        <h2 className="text-xl font-black uppercase tracking-wide">Shop by category</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CATEGORIES.map((category) => {
            const meta = SHOP_CATEGORY_META[category];
            const Icon = CATEGORY_ICONS[category];
            const href =
              category === "efootball" ? "/shop/category/efootball" : `/shop/category/${category}`;
            return (
              <Link key={category} href={href} data-testid={`link-category-${category}`}>
                <div
                  className="group relative overflow-hidden rounded-xl border border-border bg-card p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = meta.accent)}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = "")}
                >
                  <div
                    className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full opacity-20 blur-2xl transition-opacity group-hover:opacity-40"
                    style={{ backgroundColor: meta.accent }}
                    aria-hidden
                  />
                  <div
                    className="flex size-12 items-center justify-center rounded-lg border"
                    style={{ backgroundColor: meta.accentSoft, borderColor: meta.accent, boxShadow: meta.glow }}
                  >
                    <Icon className="h-6 w-6" style={{ color: meta.accent }} />
                  </div>
                  <h3 className="mt-4 text-lg font-black uppercase tracking-wide">{meta.label}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{meta.tagline}</p>
                  <span
                    className="mt-4 inline-flex items-center gap-1 text-sm font-bold"
                    style={{ color: meta.accent }}
                  >
                    Browse <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Latest products */}
      <section className="mt-10">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-black uppercase tracking-wide">Latest arrivals</h2>
        </div>
        {isLoading ? (
          <div className="mt-6 flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading products…
          </div>
        ) : !products || products.length === 0 ? (
          <div className="mt-6 rounded-xl border border-dashed border-border bg-card/50 p-12 text-center text-sm text-muted-foreground">
            No products published yet — check back soon!
          </div>
        ) : (
          <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {products.slice(0, 8).map((product) => (
              <ProductCard key={product.id} product={product} onBuy={setBuyProduct} />
            ))}
          </div>
        )}
      </section>

      {buyProduct ? <PurchaseDialog product={buyProduct} onClose={() => setBuyProduct(null)} /> : null}
    </div>
  );
}
