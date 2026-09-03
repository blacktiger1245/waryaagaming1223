import { Link, useLocation } from "wouter";
import { Store, ShoppingCart, Tag, ShoppingBag, ArrowLeft } from "lucide-react";

/**
 * WG-SHOP section shell — lives INSIDE the main website layout.
 *
 * The global site sidebar (Layout) stays visible and keeps WG-SHOP highlighted
 * as the active section. This shell only adds the shop's own secondary
 * navigation (Buy / Sell Your Account / My Orders) plus a Back control to the
 * main site. There is deliberately no login UI in the storefront.
 */
const SHOP_TABS = [
  { href: "/shop", label: "Buy", icon: ShoppingCart },
  { href: "/shop/sell", label: "Sell Your Account", icon: Tag },
  { href: "/shop/orders", label: "My Orders", icon: ShoppingBag },
] as const;

function isTabActive(tabHref: string, location: string): boolean {
  if (tabHref === "/shop") {
    // "Buy" covers the storefront, category listings and product details.
    return (
      location === "/shop" ||
      location.startsWith("/shop/category") ||
      location.startsWith("/shop/product")
    );
  }
  return location === tabHref || location.startsWith(`${tabHref}/`);
}

export function ShopSection({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  return (
    <div>
      {/* Sticky shop sub-navigation under the global top bar */}
      <div className="sticky top-16 z-30 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
            <Link href="/shop" className="flex items-center gap-2">
              <span className="flex size-9 items-center justify-center rounded-lg border border-primary/50 bg-primary/10 shadow-[0_0_18px_rgba(134,239,172,0.25)]">
                <Store className="h-5 w-5 text-primary" />
              </span>
              <span>
                <span className="block text-sm font-black uppercase tracking-widest text-primary wg-brand-glow">
                  WG-SHOP
                </span>
                <span className="block text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  Waryaa Gaming Marketplace
                </span>
              </span>
            </Link>

            <span className="ml-auto hidden sm:block">
              <Link
                href="/"
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
                data-testid="link-shop-back"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back to Waryaa Gaming
              </Link>
            </span>
          </div>

          {/* Section tabs */}
          <nav className="flex flex-wrap items-center gap-2 pb-3">
            {SHOP_TABS.map((tab) => {
              const Icon = tab.icon;
              const active = isTabActive(tab.href, location);
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  data-testid={`link-shop-tab-${tab.label.toLowerCase().replace(/\s+/g, "-")}`}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-xs font-black uppercase tracking-wide transition-all ${
                    active
                      ? "border-primary bg-primary text-primary-foreground shadow-[0_0_16px_rgba(134,239,172,0.35)]"
                      : "border-border bg-card text-muted-foreground hover:border-primary/50 hover:text-foreground"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {tab.label}
                </Link>
              );
            })}
            <span className="ml-auto sm:hidden">
              <Link
                href="/"
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground"
                data-testid="link-shop-back-mobile"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Main Site
              </Link>
            </span>
          </nav>
        </div>
      </div>

      {/* Section content */}
      <div>{children}</div>
    </div>
  );
}
