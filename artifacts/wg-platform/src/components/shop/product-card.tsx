import { Link } from "wouter";
import { Gamepad2, Coins as CoinsIcon, Gem, Eye, ShoppingCart, Gauge, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { storageUrl } from "@/lib/api";
import {
  formatPrice,
  SHOP_CATEGORY_META,
  EFOOTBALL_TIER_META,
  type ShopProduct,
} from "@/lib/shop";

function CategoryGlyph({ category, className }: { category: ShopProduct["category"]; className?: string }) {
  if (category === "coins") return <CoinsIcon className={className} />;
  if (category === "nitro") return <Gem className={className} />;
  return <Gamepad2 className={className} />;
}

/** Rounded Yes/No status chip used for Konami ID / Google Play / Game Center. */
export function StatusChip({ label, ok }: { label: string; ok: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold ${
        ok
          ? "border-green-500/40 bg-green-500/10 text-green-400"
          : "border-border bg-muted/40 text-muted-foreground"
      }`}
    >
      <Link2 className="h-3 w-3" />
      {label}: {ok ? "Yes" : "No"}
    </span>
  );
}

function ProductImage({ product, className }: { product: ShopProduct; className?: string }) {
  const src = storageUrl(product.profileImagePath);
  const meta = SHOP_CATEGORY_META[product.category];
  if (src) {
    return (
      <img
        src={src}
        alt={product.title}
        className={`${className} object-cover`}
        loading="lazy"
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).style.display = "none";
        }}
      />
    );
  }
  return (
    <div
      className={`${className} flex items-center justify-center`}
      style={{ background: `linear-gradient(145deg, ${meta.accentSoft}, rgba(0,0,0,0.4))` }}
    >
      <CategoryGlyph category={product.category} className="h-12 w-12 opacity-70" />
    </div>
  );
}

/**
 * The premium storefront card.
 *
 * - Large image area always uses the manager's uploaded profile picture.
 * - Overlay/opposite area shows Price (labelled "Price", never "From"),
 *   Team Strength and the Konami ID status at a glance.
 * - eFootball accounts get "View More Details"; coins & Nitro get "Buy".
 */
export function ProductCard({
  product,
  onBuy,
}: {
  product: ShopProduct;
  onBuy?: (product: ShopProduct) => void;
}) {
  const meta = SHOP_CATEGORY_META[product.category];
  const tierLabel =
    product.category === "efootball" && product.subcategory
      ? EFOOTBALL_TIER_META[product.subcategory].label
      : meta.label;

  return (
    <div
      data-testid={`card-product-${product.id}`}
      className="group relative flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-xl"
      style={{ "--card-accent": meta.accent } as React.CSSProperties}
    >
      {/* Large image area — profile picture uploaded by the manager */}
      <Link href={`/shop/product/${product.id}`} className="relative block aspect-[4/3] overflow-hidden bg-muted">
        <ProductImage
          product={product}
          className="absolute inset-0 h-full w-full transition-transform duration-500 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
        <span
          className="absolute left-3 top-3 rounded-md px-2 py-1 text-[11px] font-black uppercase tracking-wider text-black"
          style={{ backgroundColor: meta.accent, boxShadow: meta.glow }}
        >
          {tierLabel}
        </span>
        {/* Overlay info strip: price + team strength at a glance */}
        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-white/60">Price</p>
            <p className="text-xl font-black text-white drop-shadow">{formatPrice(product.totalPriceCents)}</p>
            {product.webFeeCents > 0 ? (
              <p className="text-[10px] font-semibold text-white/60">
                {formatPrice(product.priceCents)} + {formatPrice(product.webFeeCents)} web fee
              </p>
            ) : null}
          </div>
          {product.teamStrength !== null ? (
            <span className="inline-flex items-center gap-1 rounded-md border border-white/20 bg-black/50 px-2 py-1 text-[11px] font-bold text-white backdrop-blur">
              <Gauge className="h-3.5 w-3.5 text-green-400" />
              {product.teamStrength.toLocaleString()} TS
            </span>
          ) : null}
        </div>
      </Link>

      {/* Info / overlay area */}
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div>
          <h3 className="font-black leading-tight text-foreground line-clamp-1">{product.title}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
            {product.coinAmount ?? product.nitroPlan ?? product.description ?? tierLabel}
          </p>
        </div>

        {product.category === "efootball" ? (
          <div className="flex flex-wrap gap-1.5">
            <StatusChip label="Konami ID" ok={product.konamiIdLinked} />
            <StatusChip label="Google Play" ok={product.googlePlayLinked} />
            <StatusChip label="Game Center" ok={product.gameCenterLinked} />
          </div>
        ) : null}

        <div className="mt-auto flex gap-2 pt-1">
          {product.category === "efootball" ? (
            <Button asChild className="flex-1 font-bold" data-testid={`button-details-${product.id}`}>
              <Link href={`/shop/product/${product.id}`}>
                <Eye className="mr-1 h-4 w-4" />
                View More Details
              </Link>
            </Button>
          ) : (
            <Button
              className="flex-1 font-bold"
              onClick={() => onBuy?.(product)}
              data-testid={`button-buy-${product.id}`}
            >
              <ShoppingCart className="mr-1 h-4 w-4" />
              Buy
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
