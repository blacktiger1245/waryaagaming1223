import { Link, useLocation } from "wouter";
import { Home, ExternalLink, LogOut, ShieldCheck, Users2, Swords } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";

const navItems = [
  { href: "/referee", label: "Referee Home", icon: Home },
  { href: "/referee/matches", label: "Matches", icon: Swords },
  { href: "/referees", label: "Referees", icon: Users2 },
];

export function RefereeLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen flex bg-background wg-site wg-site-bg wg-grid-bg">
      <aside className="w-60 flex-shrink-0 border-r border-sidebar-border bg-sidebar flex flex-col">
        <div className="h-16 flex items-center gap-2.5 px-5 border-b border-sidebar-border">
          <img src={`${import.meta.env.BASE_URL}logo.jpg`} alt="Waryaa Gaming" className="size-8 rounded-sm glow-primary object-cover" />
          <span className="font-black text-sm tracking-widest text-sidebar-foreground uppercase">WG Referee</span>
        </div>

        <nav className="flex-1 py-4 px-3 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = location === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-bold uppercase tracking-wide transition-colors ${
                  active ? "bg-primary text-primary-foreground" : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                }`}
              >
                <Icon className="w-4 h-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-3 border-t border-sidebar-border space-y-1">
          <a
            href={import.meta.env.BASE_URL}
            className="flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-bold uppercase tracking-wide text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
            View Site
          </a>

          <div className="px-3 py-2 flex items-center gap-2 min-w-0">
            {user?.avatarUrl ? <img src={user.avatarUrl} alt="avatar" className="w-6 h-6 rounded-full flex-shrink-0" /> : null}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <ShieldCheck className="w-3 h-3 text-primary flex-shrink-0" />
                <p className="text-xs font-bold text-sidebar-foreground/80 truncate uppercase">Referee</p>
              </div>
              <p className="text-xs text-sidebar-foreground/50 truncate">{user?.displayName ?? user?.username}</p>
            </div>
          </div>

          <Button variant="ghost" className="w-full justify-start gap-3 text-sidebar-foreground/70 hover:text-destructive px-3" onClick={() => logout()}>
            <LogOut className="w-4 h-4" />
            Logout
          </Button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}