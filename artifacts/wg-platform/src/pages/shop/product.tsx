import { useEffect, useMemo, useState } from "react";
import { Link, useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Loader2, ArrowLeft, Gauge, ShoppingCart, ImageOff, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PurchaseDialog } from "@/components/shop/purchase-dialog";
import { StatusChip } from "@/components/shop/product-card";
import { storageUrl } from "@/lib/api";
import {
  fetchShopProduct,
  formatPrice,
  SHOP_CATEGORY_META,
  EFOOTBALL_TIER_META,
} from "@/lib/shop";

/**
 * Product details — /shop/product/:id
 * Full gallery with thumbnails (profile picture first), price, team strength
 * and the three account link statuses.
 */
export default function ShopProductPage() {
  const [match, params] = useRoute("/shop/product/:id");
  const id = match && params ? Number(params.id) : NaN;

  const [activeImage, setActiveImage] = useState(0);
  const [buying, setBuying] = useState(false);

  const { data: product, isLoading, isError } = useQuery({
    queryKey: ["shop", "product", id],
    queryFn: () => fetchShopProduct(id),
    enabled: Number.isInteger(id) && id > 0,
  });

  // Reset the gallery selection whenever a different product loads.
  useEffect(() => {
    setActiveImage(0);
  }, [id]);

  const gallery = useMemo(() => {
    if (!product) return [] as string[];
    const paths = [...product.galleryPaths];
    // The profile picture is always first on the card; make sure the gallery
    // opens on it even if the manager reordered the array.
    if (product.profileImagePath && paths[0] !== product.profileImagePath) {
      const idx = paths.indexOf(product.profileImagePath);
      if (idx > 0) paths.splice(idx, 1);
      paths.unshift(product.profileImagePath);
    }
    return paths;
  }, [product]);

  if (!match || !Number.isInteger(id) || id <= 0 || isError) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <p className="text-lg font-bold">Product not found.</p>
        <Link href="/shop" className="mt-2 inline-block text-sm font-bold text-primary hover:underline">
          Back to WG-SHOP
        </Link>
      </div>
    );
  }

  if (isLoading || !product) {
    return (
      <div className="flex items-center justify-center py-32 text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading product…
      </div>
    );
  }

  const meta = SHOP_CATEGORY_META[product.category];
  const tierLabel =
    product.category === "efootball" && product.subcategory
      ? EFOOTBALL_TIER_META[product.subcategory].label
      : meta.label;
  const activeSrc = storageUrl(gallery[activeImage]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <Link
        href={
          product.category === "efootball"
            ? `/shop/category/efootball${product.subcategory ? `?tier=${product.subcategory}` : ""}`
            : `/shop/category/${product.category}`
        }
        className="inline-flex items-center gap-1.5 text-sm font-bold text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to {tierLabel}
      </Link>

      <div className="mt-5 grid gap-8 lg:grid-cols-2">
        {/* Gallery — large image + thumbnails */}
        <div className="space-y-3">
          <div
            className="relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-2xl border border-border bg-card"
            style={{ boxShadow: `inset 0 0 120px ${meta.accentSoft}` }}
          >
            {activeSrc ? (
              <img
                src={activeSrc}
                alt={`${product.title} screenshot ${activeImage + 1}`}
                className="h-full w-full object-contain"
              />
            ) : (
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <ImageOff className="h-10 w-10" />
                <span className="text-sm font-bold">No images uploaded</span>
              </div>
            )}
            <span
              className="absolute left-3 top-3 rounded-md px-2 py-1 text-[11px] font-black uppercase tracking-wider text-black"
              style={{ backgroundColor: meta.accent, boxShadow: meta.glow }}
            >
              {tierLabel}
            </span>
          </div>

          {gallery.length > 1 ? (
            <div className="grid grid-cols-5 gap-2 sm:grid-cols-6">
              {gallery.map((path, idx) => {
                const thumb = storageUrl(path);
                if (!thumb) return null;
                return (
                  <button
                    key={`${path}-${idx}`}
                    onClick={() => setActiveImage(idx)}
                    className={`aspect-square overflow-hidden rounded-lg border-2 transition-all ${
                      idx === activeImage ? "border-primary shadow-md" : "border-border opacity-70 hover:opacity-100"
                    }`}
                    aria-label={`View image ${idx + 1}`}
                  >
                    <img src={thumb} alt="" className="h-full w-full object-cover" loading="lazy" />
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>

        {/* Details */}
        <div className="space-y-5">
          <div>
            <h1 className="text-2xl font-black uppercase tracking-wide sm:text-3xl">{product.title}</h1>
            <p className="mt-1 text-sm font-bold" style={{ color: meta.accent }}>
              {tierLabel}
            </p>
          </div>

          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="min-w-[240px] space-y-1.5">
                <div className="flex items-center justify-between gap-6">
                  <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                    Product Price
                  </span>
                  <span className="text-sm font-bold text-foreground">{formatPrice(product.priceCents)}</span>
                </div>
                <div className="flex items-center justify-between gap-6">
                  <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Web Fee</span>
                  <span className="text-sm font-bold text-amber-400">{formatPrice(product.webFeeCents)}</span>
                </div>
                <div className="mt-1 flex items-center justify-between gap-6 border-t border-border pt-2">
                  <span className="text-xs font-black uppercase tracking-widest text-foreground">Total Price</span>
                  <span className="text-2xl font-black text-primary" data-testid="product-total-price">
                    {formatPrice(product.totalPriceCents)}
                  </span>
                </div>
              </div>
              {product.teamStrength !== null ? (
                <div className="text-right">
                  <p className="flex items-center justify-end gap-1 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                    <Gauge className="h-3.5 w-3.5" /> Team Strength
                  </p>
                  <p className="text-2xl font-black text-green-400">{product.teamStrength.toLocaleString()}</p>
                </div>
              ) : null}
              {product.coinAmount ? (
                <div className="text-right">
                  <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Amount</p>
                  <p className="text-xl font-black text-yellow-400">{product.coinAmount}</p>
                </div>
              ) : null}
              {product.nitroPlan ? (
                <div className="text-right">
                  <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Plan</p>
                  <p className="text-xl font-black text-indigo-400">{product.nitroPlan}</p>
                </div>
              ) : null}
            </div>
          </div>

          {/* Account link statuses — eFootball accounts only */}
          {product.category === "efootball" ? (
            <div className="rounded-xl border border-border bg-card p-5">
              <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                <ShieldCheck className="h-4 w-4" /> Account links
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <StatusChip label="Konami ID Linked" ok={product.konamiIdLinked} />
                <StatusChip label="Google Play Account" ok={product.googlePlayLinked} />
                <StatusChip label="Game Center" ok={product.gameCenterLinked} />
              </div>
            </div>
          ) : null}

          {product.description ? (
            <div className="rounded-xl border border-border bg-card p-5">
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Details</p>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
                {product.description}
              </p>
            </div>
          ) : null}

          <Button
            size="lg"
            className="w-full font-black uppercase tracking-wide"
            onClick={() => setBuying(true)}
            data-testid="button-buy-now"
          >
            <ShoppingCart className="mr-2 h-4 w-4" />
            Buy Now — {formatPrice(product.totalPriceCents)}
          </Button>
        </div>
      </div>

      {buying ? <PurchaseDialog product={product} onClose={() => setBuying(false)} /> : null}
    </div>
  );
}

