import { useState } from "react";
import { Link, useLocation } from "wouter";
import {
  Trophy,
  Users,
  Shield,
  Radio,
  Newspaper,
  PlaySquare,
  Menu,
  X,
  LogOut,
  ChevronDown,
  Home,
  GraduationCap,
  Handshake,
  ShoppingBag,
  LayoutDashboard,
  CalendarDays,
  BarChart2,
  MessageSquare,
} from "lucide-react";
import { Button } from "./ui/button";
import { useAuth } from "@/hooks/use-auth";
import { Crown, ShieldCheck } from "lucide-react";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, isLoading, isLoggedIn, loginWithDiscord, logout } = useAuth();

  const navLinks = [
    { href: "/", label: "Home", icon: Home },
    { href: "/tournaments", label: "Tournaments", icon: Trophy },
    { href: "/players", label: "Players", icon: Users },
    { href: "/teams", label: "Teams", icon: Shield },
    { href: "/fixtures", label: "Fixtures", icon: CalendarDays },
    { href: "/rankings", label: "Rankings", icon: Trophy },
    { href: "/news", label: "News", icon: Newspaper },
    { href: "/media", label: "Media", icon: PlaySquare },
    { href: "/community", label: "Community", icon: MessageSquare },
    { href: "/live", label: "Live", icon: Radio, live: true },
    { href: "/academy", label: "WG Academy", icon: GraduationCap },
    { href: "/partners", label: "Partners", icon: Handshake },
    { href: "/marketplace", label: "Marketplace", icon: ShoppingBag },
  ];

  return (
    <div className="min-h-screen flex bg-background">
      {/* Top bar (all screen sizes) */}
      <div className="fixed top-0 left-0 right-0 z-50 h-16 flex items-center gap-3 px-4 border-b border-border bg-background/95 backdrop-blur">
        <button
          className="text-muted-foreground hover:text-foreground p-1"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          data-testid="button-menu-toggle"
        >
          {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
        <Link href="/" className="flex items-center gap-2.5">
          <img src={`${import.meta.env.BASE_URL}logo.jpg`} alt="Waryaa Gaming" className="size-8 rounded-sm glow-primary object-cover" />
          <span className="font-black text-lg tracking-widest text-primary uppercase">Waryaa Gaming</span>
        </Link>
      </div>

      {/* Sidebar (toggle drawer on all screen sizes) */}
      <aside
        className={`fixed top-0 left-0 h-[100dvh] w-64 flex-shrink-0 border-r border-sidebar-border bg-sidebar flex flex-col z-50 transition-transform duration-200
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="h-16 flex-shrink-0" />

        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
          {navLinks.map((link) => {
            const Icon = link.icon;
            const active = location === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setSidebarOpen(false)}
                data-testid={`link-nav-${link.label.toLowerCase().replace(/\s+/g, "-")}`}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-bold uppercase tracking-wide transition-colors
                  ${
                    link.live
                      ? active
                        ? "bg-pink-accent text-white"
                        : "text-pink-accent hover:bg-pink-accent/10"
                      : active
                        ? "bg-primary text-primary-foreground"
                        : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                  }`}
              >
                {link.live ? (
                  <span className="relative flex items-center justify-center w-4 h-4">
                    <span className="w-2 h-2 rounded-full bg-pink-accent live-pulse" />
                  </span>
                ) : (
                  <Icon className="w-4 h-4" />
                )}
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-3 border-t border-sidebar-border space-y-3 flex-shrink-0 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {isLoading ? (
            <div className="h-9 w-full rounded-md bg-muted animate-pulse" />
          ) : isLoggedIn && user ? (
            <UserMenu user={user} onLogout={() => logout()} />
          ) : (
            <Button
              size="sm"
              className="gap-2 font-bold w-full"
              onClick={loginWithDiscord}
              data-testid="button-login-discord"
            >
              <DiscordIcon />
              Login with Discord
            </Button>
          )}
          <a
            href="https://discord.gg"
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-center gap-2 w-full rounded-md bg-pink-accent hover-pink-accent glow-pink text-white text-sm font-bold uppercase tracking-wide px-3 py-2.5 transition-colors"
            data-testid="link-join-discord"
          >
            <DiscordIcon />
            Join Discord
          </a>
          {isLoggedIn && user && (user.role === "admin" || user.role === "owner") ? (
            // Logged-in admin/owner: show a prominent Admin Panel shortcut
            <Link
              href="/admin"
              className="flex items-center justify-center gap-2 w-full rounded-md border border-primary/40 bg-primary/10 text-primary hover:bg-primary/20 text-xs font-bold uppercase tracking-wide px-3 py-2 transition-colors"
              data-testid="link-admin-panel"
            >
              {user.role === "owner" ? (
                <Crown className="w-3.5 h-3.5" />
              ) : (
                <ShieldCheck className="w-3.5 h-3.5" />
              )}
              {user.role === "owner" ? "Owner Panel" : "Admin Panel"}
            </Link>
          ) : (
            <Link
              href="/admin/login"
              className="flex items-center justify-center gap-2 w-full rounded-md border border-sidebar-border text-sidebar-foreground/50 hover:text-sidebar-foreground hover:border-sidebar-foreground/30 text-xs font-bold uppercase tracking-wide px-3 py-2 transition-colors"
              data-testid="link-admin"
            >
              <LayoutDashboard className="w-3.5 h-3.5" />
              Admin
            </Link>
          )}
        </div>
      </aside>

      {/* Overlay behind open sidebar */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Mobile bottom tab bar ─────────────────────────────────────────── */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 lg:hidden border-t border-border bg-background/95 backdrop-blur-md flex items-stretch">
        {[
          { href: "/", label: "Home", icon: Home },
          { href: "/fixtures", label: "Fixtures", icon: CalendarDays },
          { href: "/community", label: "Community", icon: MessageSquare },
          { href: "/tournaments", label: "Events", icon: Trophy },
          { href: "/live", label: "Live", icon: Radio, live: true },
        ].map((link) => {
          const Icon = link.icon;
          const active = location === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 text-[10px] font-bold uppercase tracking-wide transition-colors
                ${link.live
                  ? active ? "text-pink-400" : "text-pink-400/60"
                  : active ? "text-primary" : "text-muted-foreground"}`}
            >
              {link.live ? (
                <span className="relative flex items-center justify-center w-5 h-5">
                  <span className="w-2.5 h-2.5 rounded-full bg-pink-accent live-pulse" />
                </span>
              ) : (
                <Icon className="w-5 h-5" />
              )}
              <span>{link.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="flex-1 flex flex-col min-w-0 pt-16 pb-16 lg:pb-0">
        <main className="flex-1 flex flex-col">{children}</main>

        <footer className="mt-20 border-t border-white/5">
          {/* Glow accent bar */}
          <div className="h-px w-full bg-gradient-to-r from-transparent via-primary/60 to-transparent" />

          <div className="bg-gradient-to-b from-card/80 to-background/95 backdrop-blur-sm">
            {/* Main footer body */}
            <div className="container mx-auto px-6 pt-14 pb-10">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-10 mb-12">

                {/* Brand column */}
                <div className="md:col-span-1 flex flex-col gap-4">
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <div className="absolute inset-0 rounded-lg bg-primary/30 blur-md" />
                      <img src={`${import.meta.env.BASE_URL}logo.jpg`} alt="Waryaa Gaming" className="relative size-10 rounded-lg border border-primary/40 object-cover" />
                    </div>
                    <div>
                      <span className="font-black text-lg tracking-widest text-foreground uppercase leading-none block">Waryaa Gaming</span>
                      <span className="text-[10px] font-bold uppercase tracking-widest text-primary/70 leading-none">Est. 2023</span>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed max-w-xs">
                    The beating heart of competitive Somali gaming. Home of eFootball &amp; Esports.
                  </p>
                  {/* Social icons */}
                  <div className="flex items-center gap-2 mt-1">
                    {[
                      { label: "Discord", href: "#", icon: (
                        <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057.1 18.085.118 18.11.136 18.126a19.888 19.888 0 0 0 5.994 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.995.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/></svg>
                      )},
                      { label: "TikTok", href: "#", icon: (
                        <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.2 8.2 0 0 0 4.79 1.53V6.75a4.85 4.85 0 0 1-1.02-.06z"/></svg>
                      )},
                      { label: "YouTube", href: "#", icon: (
                        <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
                      )},
                      { label: "Facebook", href: "#", icon: (
                        <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                      )},
                      { label: "Instagram", href: "#", icon: (
                        <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z"/></svg>
                      )},
                    ].map(({ label, href, icon }) => (
                      <a
                        key={label}
                        href={href}
                        aria-label={label}
                        className="w-8 h-8 rounded-lg bg-white/5 border border-white/8 flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/10 hover:border-primary/30 transition-all duration-200"
                      >
                        {icon}
                      </a>
                    ))}
                  </div>
                </div>

                {/* Platform links */}
                <div>
                  <h4 className="text-[11px] font-black uppercase tracking-widest text-primary mb-4">Platform</h4>
                  <ul className="space-y-2.5">
                    {[
                      { href: "/tournaments", label: "Tournaments" },
                      { href: "/fixtures",    label: "Fixtures" },
                      { href: "/rankings",    label: "Rankings" },
                      { href: "/teams",       label: "Teams" },
                      { href: "/players",     label: "Players" },
                    ].map(({ href, label }) => (
                      <li key={href}>
                        <Link href={href} className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5 group">
                          <span className="w-1 h-1 rounded-full bg-primary/40 group-hover:bg-primary transition-colors" />
                          {label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Content links */}
                <div>
                  <h4 className="text-[11px] font-black uppercase tracking-widest text-primary mb-4">Community</h4>
                  <ul className="space-y-2.5">
                    {[
                      { href: "/news",        label: "News" },
                      { href: "/media",       label: "Media" },
                      { href: "/live",        label: "Live Streams" },
                      { href: "/academy",     label: "WG Academy" },
                      { href: "/partners",    label: "Partners" },
                    ].map(({ href, label }) => (
                      <li key={href}>
                        <Link href={href} className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5 group">
                          <span className="w-1 h-1 rounded-full bg-primary/40 group-hover:bg-primary transition-colors" />
                          {label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Divider */}
              <div className="h-px bg-gradient-to-r from-transparent via-white/8 to-transparent mb-8" />

              {/* Bottom bar */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground/60">
                <span>© {new Date().getFullYear()} Waryaa Gaming. All rights reserved.</span>
                <div className="flex items-center gap-2 font-mono">
                  <Shield className="w-3.5 h-3.5 text-primary/50" />
                  <span>Powered by <span className="text-muted-foreground">Somali Esports Federation</span></span>
                </div>
              </div>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}

function DiscordIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057.1 18.085.118 18.11.136 18.126a19.888 19.888 0 0 0 5.994 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.995a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z" />
    </svg>
  );
}

function UserMenu({ user, onLogout }: { user: { username: string; displayName: string | null; avatarUrl: string | null }; onLogout: () => void }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 hover:border-primary/50 transition-colors w-full"
        data-testid="button-user-menu"
      >
        {user.avatarUrl ? (
          <img src={user.avatarUrl} alt="avatar" className="w-6 h-6 rounded-full" />
        ) : (
          <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-xs font-black text-primary">
            {(user.displayName ?? user.username).charAt(0).toUpperCase()}
          </div>
        )}
        <span className="text-sm font-bold flex-1 text-left truncate">{user.displayName ?? user.username}</span>
        <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform flex-shrink-0 ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 bottom-full mb-2 w-full rounded-lg border border-border bg-card shadow-lg z-50 overflow-hidden">
            <div className="px-4 py-3 border-b border-border">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Logged in as</p>
              <p className="font-bold text-sm truncate mt-0.5">{user.username}</p>
            </div>
            <button
              onClick={() => { onLogout(); setOpen(false); }}
              className="w-full flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
              data-testid="button-logout"
            >
              <LogOut className="w-4 h-4" />
              Logout
            </button>
          </div>
        </>
      )}
    </div>
  );
}
