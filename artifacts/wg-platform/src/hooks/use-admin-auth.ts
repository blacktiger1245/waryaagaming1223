import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface AdminUser {
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  role: "admin" | "owner";
}

async function fetchAdminMe(): Promise<AdminUser | null> {
  const res = await fetch("/api/admin/me", { credentials: "include" });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error("Failed to fetch admin session");
  return res.json() as Promise<AdminUser>;
}

async function adminLogin(payload: { username: string; password: string }): Promise<AdminUser> {
  const res = await fetch("/api/admin/login", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? "Login failed");
  }
  return res.json() as Promise<AdminUser>;
}

async function adminLogout(): Promise<void> {
  await fetch("/api/admin/logout", { method: "POST", credentials: "include" });
}

export function useAdminAuth() {
  const qc = useQueryClient();

  const { data: admin, isLoading } = useQuery({
    queryKey: ["admin", "me"],
    queryFn: fetchAdminMe,
    staleTime: 30 * 1000,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    retry: false,
  });

  const loginMutation = useMutation({
    mutationFn: adminLogin,
    onSuccess: (data) => {
      qc.setQueryData(["admin", "me"], data);
    },
  });

  const logoutMutation = useMutation({
    mutationFn: adminLogout,
    onSuccess: () => {
      qc.setQueryData(["admin", "me"], null);
      // Also invalidate the main auth query so the sidebar updates
      qc.invalidateQueries({ queryKey: ["auth", "me"] });
    },
  });

  return {
    admin: admin ?? null,
    isLoading,
    isLoggedIn: !!admin,
    isOwner: admin?.role === "owner",
    login: loginMutation.mutateAsync,
    isLoggingIn: loginMutation.isPending,
    loginError: loginMutation.error as Error | null,
    logout: logoutMutation.mutate,
  };
}
