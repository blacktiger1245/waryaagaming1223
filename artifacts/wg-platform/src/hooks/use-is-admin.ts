import { useAuth } from "./use-auth";
import { useAdminAuth } from "./use-admin-auth";

/**
 * Is the current visitor an admin/owner — however they authenticated?
 *
 * There are two independent sessions on this site:
 *   • the Discord player session (useAuth → /api/auth/me), where the player row
 *     carries role 'admin' | 'owner', and
 *   • the admin dashboard session (useAdminAuth → /api/admin/me), which also
 *     accepts the legacy /admin/login password fallback and therefore has no
 *     player row at all.
 *
 * Checking both means an admin always sees the "Admin Dashboard" shortcut
 * instead of the visitor-facing "Join Discord" invite, no matter how they
 * signed in.
 */
export function useIsAdmin() {
  const { user } = useAuth();
  const { isLoggedIn: hasAdminSession, isOwner: isOwnerSession } = useAdminAuth();

  return {
    isAdmin: user?.role === "admin" || user?.role === "owner" || hasAdminSession,
    isOwner: user?.role === "owner" || isOwnerSession,
  };
}
