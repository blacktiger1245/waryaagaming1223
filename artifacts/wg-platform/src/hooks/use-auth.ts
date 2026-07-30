import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface AuthUser {
  id: number;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  discordId: string;
  role: "player" | "admin" | "owner";
  profileComplete: boolean;
}

const LOGIN_PATH = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api/auth/discord`;

async function fetchMe(): Promise<AuthUser | null> {
  const res = await fetch("/api/auth/me", { credentials: "include" });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error("Failed to fetch user");
  return res.json() as Promise<AuthUser>;
}

async function logout(): Promise<void> {
  await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
}

export function useAuth() {
  const qc = useQueryClient();

  const { data: user, isLoading } = useQuery({
    queryKey: ["auth", "me"],
    queryFn: fetchMe,
    // Short staleTime + refetch-on-focus/mount so opening the site (new tab,
    // returning to an open tab, navigating between pages) re-checks with the
    // server, which opportunistically re-syncs the Discord profile.
    staleTime: 30 * 1000,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
    retry: false,
  });

  const logoutMutation = useMutation({
    mutationFn: logout,
    onSuccess: () => {
      qc.setQueryData(["auth", "me"], null);
    },
  });

  const loginWithDiscord = () => {
    window.location.href = LOGIN_PATH;
  };

  return {
    user: user ?? null,
    isLoading,
    isLoggedIn: !!user,
    isAdmin: user?.role === "admin" || user?.role === "owner",
    isOwner: user?.role === "owner",
    loginWithDiscord,
    logout: logoutMutation.mutate,
  };
}
