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
} from "lucide-react";
import { useAdminAuth } from "@/hooks/use-admin-auth";
import { Button } from "@/components/ui/button";

const baseNavItems = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/seasons", label: "Seasons", icon: CalendarRange },
  { href: "/admin/players", label: "Players", icon: Users },
  { href: "/admin/teams", label: "Teams", icon: Shield },
  { href: "/admin/tournaments", label: "Tournaments", icon: Trophy },
  { href: "/admin/matches", label: "Matches", icon: Swords },
  { href: "/admin/news", label: "News", icon: Newspaper },
  { href: "/admin/media", label: "Media", icon: PlaySquare },
  { href: "/admin/hall-of-fame", label: "Hall of Fame", icon: Star },
  { href: "/admin/announcements", label: "Announcements", icon: Megaphone },
  { href: "/admin/registration-logs", label: "Registration Logs", icon: ClipboardList },
];

// Extra nav item shown only to the owner.
const ownerNavItem = { href: "/admin/manage-admins", label: "Manage Admins", icon: UserCog };

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { admin, isLoading, isLoggedIn, isOwner, logout } = useAdminAuth();

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

  const navItems = isOwner ? [...baseNavItems, ownerNavItem] : baseNavItems;

  return (
    <div className="min-h-screen flex bg-background">
      <aside className="w-60 flex-shrink-0 border-r border-sidebar-border bg-sidebar flex flex-col">
        <div className="h-16 flex items-center gap-2.5 px-5 border-b border-sidebar-border">
          <img src={`${import.meta.env.BASE_URL}logo.jpg`} alt="Waryaa Gaming" className="size-8 rounded-sm glow-primary object-cover" />
          <span className="font-black text-sm tracking-widest text-sidebar-foreground uppercase">
            WG Admin
          </span>
        </div>

        <nav className="flex-1 py-4 px-3 space-y-1">
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
        </nav>

        <div className="p-3 border-t border-sidebar-border space-y-1">
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

      <main className="flex-1 overflow-y-auto p-8">{children}</main>
    </div>
  );
}
