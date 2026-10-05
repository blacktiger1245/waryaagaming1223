import { useEffect, useState } from "react";
import { Link, useLocation, Redirect } from "wouter";
import {
  LayoutDashboard,
  Users,
  Shield,
  Trophy,
  Swords,
  Newspaper,
  PlaySquare,
  Star,
  LogOut,
  Loader2,
  ExternalLink,
  UserCog,
  Crown,
  CalendarRange,
  Megaphone,
  ClipboardList,
  LifeBuoy,
  History,
  BarChart3,
  Gamepad2,
  Coins,
  Gem,
  ShoppingBag,
  ClipboardCheck,
  Menu,
  X,
} from "lucide-react";
import { useAdminAuth } from "@/hooks/use-admin-auth";
import { Button } from "@/components/ui/button";

const baseNavItems = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/seasons", label: "Seasons", icon: CalendarRange },
  { href: "/admin/players", label: "Players", icon: Users },
  { href: "/admin/teams", label: "Clans", icon: Shield },
  { href: "/admin/tournaments", label: "Tournaments", icon: Trophy },
  { href: "/admin/matches", label: "Matches", icon: Swords },
  { href: "/admin/match-results", label: "Match Results", icon: ClipboardCheck },
  { href: "/admin/news", label: "News", icon: Newspaper },
  { href: "/admin/media", label: "Media", icon: PlaySquare },
  { href: "/admin/hall-of-fame", label: "Hall of Fame", icon: Star },
  { href: "/admin/announcements", label: "Announcements", icon: Megaphone },
  { href: "/admin/support", label: "Support", icon: LifeBuoy },
  { href: "/admin/support/history", label: "Support History", icon: History },
  { href: "/admin/registration-logs", label: "Registration Logs", icon: ClipboardList },
];

// Extra nav items shown only to the owner.
const ownerNavItems = [
  { href: "/admin/manage-admins", label: "Manage Admins", icon: UserCog },
  { href: "/admin/ads", label: "Ads Management", icon: PlaySquare },
  { href: "/admin/support/analytics", label: "Support Analytics", icon: BarChart3 },
];

// WG-SHOP Manager section — admin/owner gated (the WG-SHOP Manager role).
const shopNavItems = [
  { href: "/admin/shop", label: "Dashboard", icon: LayoutDashboard, section: "WG-SHOP" },
  { href: "/admin/shop/efootball", label: "eFootball Accounts", icon: Gamepad2, section: "WG-SHOP" },
  { href: "/admin/shop/coins", label: "Coins", icon: Coins, section: "WG-SHOP" },
  { href: "/admin/shop/nitro", label: "Discord Nitro", icon: Gem, section: "WG-SHOP" },
  { href: "/admin/shop/sell-logs", label: "Sell Logs", icon: ClipboardCheck, section: "WG-SHOP" },
  { href: "/admin/shop/orders", label: "My Orders", icon: ShoppingBag, section: "WG-SHOP" },
];

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [navOpen, setNavOpen] = useState(false);
  const { admin, isLoading, isLoggedIn, isOwner, logout } = useAdminAuth();

  // Below lg the admin sidebar becomes a slide-out drawer. Any navigation
  // closes it, and Escape closes it too, so it can never be left open over a
  // page — the same behaviour as the public site's menu.
  useEffect(() => {
    setNavOpen(false);
  }, [location]);

  useEffect(() => {
    if (!navOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setNavOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navOpen]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!isLoggedIn && location !== "/admin/login") {
    return <Redirect to="/admin/login" />;
  }

  if (location === "/admin/login") {
    return <>{children}</>;
  }

  const navItems = isOwner ? [...baseNavItems, ...ownerNavItems] : baseNavItems;

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile top bar (below lg) — the admin sidebar is a drawer there. */}
      <header className="lg:hidden fixed top-0 left-0 right-0 z-50 h-14 flex items-center gap-2.5 px-3 border-b border-sidebar-border bg-sidebar/95 backdrop-blur">
        <button
          className="shrink-0 rounded-md p-1.5 text-sidebar-foreground/70 hover:text-sidebar-foreground"
          onClick={() => setNavOpen((v) => !v)}
          aria-label="Toggle admin menu"
          aria-expanded={navOpen}
          data-testid="button-admin-menu-toggle"
        >
          {navOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
        <img
          src={`${import.meta.env.BASE_URL}logo.jpg`}
          alt=""
          className="size-7 shrink-0 rounded-sm object-cover"
        />
        <span className="min-w-0 truncate font-black text-sm tracking-widest text-sidebar-foreground uppercase">
          WG Admin
        </span>
        <span className="ml-auto shrink-0 rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-primary">
          {admin?.role ?? "admin"}
        </span>
      </header>

      <div className="flex min-h-screen">
        {/* Backdrop behind the open drawer (tap anywhere to close) */}
        {navOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
            onClick={() => setNavOpen(false)}
            aria-hidden
          />
        )}

        {/* w-60 and static on desktop; a slide-out drawer below lg. */}
        <aside
          className={`fixed top-0 left-0 z-[60] h-[100dvh] w-64 max-w-[85vw] flex flex-shrink-0 flex-col border-r border-sidebar-border bg-sidebar shadow-2xl transition-transform duration-300 ease-out
            lg:static lg:z-auto lg:h-auto lg:w-60 lg:max-w-none lg:translate-x-0 lg:shadow-none
            ${navOpen ? "translate-x-0" : "-translate-x-full"}`}
        >
          <div className="h-16 flex flex-shrink-0 items-center gap-2.5 px-5 border-b border-sidebar-border">
            <img src={`${import.meta.env.BASE_URL}logo.jpg`} alt="Waryaa Gaming" className="size-8 rounded-sm glow-primary object-cover" />
            <span className="font-black text-sm tracking-widest text-sidebar-foreground uppercase">
              WG Admin
            </span>
            <button
              className="ml-auto rounded-md p-1.5 text-sidebar-foreground/60 hover:text-sidebar-foreground lg:hidden"
              onClick={() => setNavOpen(false)}
              aria-label="Close admin menu"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = location === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  data-testid={`link-admin-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-bold uppercase tracking-wide transition-colors
                    ${active ? "bg-primary text-primary-foreground" : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"}`}
                >
                  <Icon className="w-4 h-4" />
                  {item.label}
                </Link>
              );
            })}

            {/* WG-SHOP Manager section */}
            <div className="pt-4">
              <p className="px-3 pb-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-sidebar-foreground/40">
                WG-SHOP Manager
              </p>
              {shopNavItems.map((item) => {
                const Icon = item.icon;
                const active = location === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    data-testid={`link-admin-shop-${item.href.replace("/admin/shop", "") || "dashboard"}`}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-bold uppercase tracking-wide transition-colors
                      ${active ? "bg-primary text-primary-foreground" : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"}`}
                  >
                    <Icon className="w-4 h-4" />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </nav>

          <div className="flex-shrink-0 p-3 border-t border-sidebar-border space-y-1 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <a
              href={import.meta.env.BASE_URL}
              className="flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-bold uppercase tracking-wide text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              View Site
            </a>

            {/* Identity badge */}
            <div className="px-3 py-2 flex items-center gap-2 min-w-0">
              {admin?.avatarUrl ? (
                <img src={admin.avatarUrl} alt="avatar" className="w-6 h-6 rounded-full flex-shrink-0" />
              ) : null}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  {admin?.role === "owner" && <Crown className="w-3 h-3 text-yellow-400 flex-shrink-0" />}
                  <p className="text-xs font-bold text-sidebar-foreground/80 truncate capitalize">
                    {admin?.role ?? "admin"}
                  </p>
                </div>
                <p className="text-xs text-sidebar-foreground/50 truncate">{admin?.displayName ?? admin?.username}</p>
              </div>
            </div>

            <Button
              variant="ghost"
              className="w-full justify-start gap-3 text-sidebar-foreground/70 hover:text-destructive px-3"
              onClick={() => logout()}
              data-testid="button-admin-logout"
            >
              <LogOut className="w-4 h-4" />
              Logout
            </Button>
          </div>
        </aside>

        {/* pt clears the fixed mobile top bar; from lg the drawer is static
            and the top bar is gone, so normal padding applies. */}
        <main className="flex-1 min-w-0 overflow-y-auto p-4 pt-[4.5rem] sm:p-6 sm:pt-[4.5rem] lg:p-8 lg:pt-8">
          {children}
        </main>
      </div>
    </div>
  );
}
