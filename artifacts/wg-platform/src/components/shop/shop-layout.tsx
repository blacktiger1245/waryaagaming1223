import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Store, ShoppingBag, Menu, X } from "lucide-react";

/**
 * WG-SHOP storefront layout.
 *
 * Deliberately minimal on purpose: the sidebar carries ONLY the WG-SHOP home
 * link and My Orders — no login button, no extra categories. Customers browse
 * and order as guests (their browser keeps an order lookup id).
 */
export function ShopLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  // The sidebar starts slid in so customers arriving via the WG-SHOP link
  // (main site nav/footer) immediately see the shop menu — on desktop it is
  // always visible anyway (lg:translate-x-0). ShopLayout remounts on every
  // entry into /shop/*, so it re-opens on each visit from the main site;
  // once closed it stays closed while browsing the shop.
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const pageKey = location.split("/").filter(Boolean).slice(0, 2).join("-") || "shop";

  const navLinks = [
    { href: "/shop", label: "WG-SHOP", icon: Store },
    { href: "/shop/orders", label: "My Orders", icon: ShoppingBag },
  ];

  return (
    <div className="min-h-screen flex bg-background wg-site wg-site-bg wg-grid-bg" data-wg-page={pageKey}>
      <div className="wg-aurora" aria-hidden><i /><i /><i /><i /></div>

      {/* Top bar */}
      <div className="fixed top-0 left-0 right-0 z-50 h-16 flex items-center gap-3 px-4 border-b border-border bg-background/95 backdrop-blur">
        <button
          className="text-muted-foreground hover:text-foreground p-1"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          aria-label="Toggle menu"
          data-testid="button-shop-menu-toggle"
        >
          {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
        <Link href="/shop" className="flex items-center gap-2.5">
          <img
            src={`${import.meta.env.BASE_URL}logo.jpg`}
            alt="Waryaa Gaming"
            className="size-8 rounded-sm glow-primary object-cover"
          />
          <span className="font-black text-lg tracking-widest text-primary uppercase wg-brand-glow">
            WG-SHOP
          </span>
        </Link>
        <span className="ml-auto text-xs uppercase tracking-widest text-muted-foreground font-bold hidden sm:block">
          Waryaa Gaming Marketplace
        </span>
      </div>

      {/* Sidebar — WG-SHOP + My Orders only */}
      <aside
        className={`fixed top-0 left-0 h-[100dvh] w-64 flex-shrink-0 border-r border-sidebar-border bg-sidebar flex flex-col z-50 transition-transform duration-200 lg:translate-x-0
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="h-16 flex-shrink-0 flex items-center gap-2.5 px-5 border-b border-sidebar-border">
          <img
            src={`${import.meta.env.BASE_URL}logo.jpg`}
            alt="Waryaa Gaming"
            className="size-8 rounded-sm glow-primary object-cover"
          />
          <span className="font-black text-sm tracking-widest text-sidebar-foreground uppercase">WG-SHOP</span>
        </div>

        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
          {navLinks.map((link) => {
            const Icon = link.icon;
            const active = location === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                data-testid={`link-shop-${link.label.toLowerCase().replace(/\s+/g, "-")}`}
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-bold uppercase tracking-wide transition-colors
                  ${
                    active
                      ? "bg-primary text-primary-foreground"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                  }`}
              >
                <Icon className="w-4 h-4" />
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-sidebar-border">
          <p className="text-xs text-muted-foreground leading-relaxed">
            Gaming accounts, coins & Nitro — delivered fast by the Waryaa Gaming team.
          </p>
        </div>
      </aside>

      {/* Backdrop for mobile drawer */}
      {sidebarOpen ? (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      ) : null}

      {/* Content */}
      <main className="flex-1 pt-16 lg:pl-64 min-w-0">{children}</main>
    </div>
  );
}
