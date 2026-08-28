import { apiUrl } from "./api";

/**
 * Discord OAuth return flow for the Waryaa Gaming Android app (Capacitor).
 *
 * The app loads the live website in its WebView. Because Discord blocks OAuth
 * inside WebViews, "Login with Discord" in the app opens the SYSTEM browser;
 * after Discord redirects back to the site's normal callback, the server
 * bounces that browser tab to the `waryaagaming://auth/callback?token=…`
 * deep link, which Android uses to bring the app back to the foreground.
 *
 * The token is then exchanged here (inside the WebView) for a real `wg.sid`
 * session via /api/auth/app-exchange — so the user is logged in inside the
 * app's own WebView, not in Chrome.
 *
 * On desktop/normal browsers none of this runs (window.Capacitor is
 * undefined) and the classic full-page redirect to /auth/discord is used.
 */

export const APP_DEEP_LINK_HOST = "waryaagaming://auth/callback";

interface CapacitorAppPlugin {
  launchUrl(options: { url: string; openInSystemBrowser?: boolean }): Promise<void>;
  addListener(
    eventName: "appUrlOpen",
    listener: (data: { url: string }) => void,
  ): Promise<{ remove: () => void }>;
}

export function isNativeApp(): boolean {
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean; Plugins?: { App?: CapacitorAppPlugin } } }).Capacitor;
  return !!cap?.isNativePlatform?.() && !!cap.Plugins?.App;
}

function getAppPlugin(): CapacitorAppPlugin | null {
  const cap = (window as unknown as { Capacitor?: { Plugins?: { App?: CapacitorAppPlugin } } }).Capacitor;
  return cap?.Plugins?.App ?? null;
}

let listenerRegistered = false;

/**
 * Registers the deep-link listener once (called from the app root so it also
 * works if the app is cold-started by the deep link). When the OAuth callback
 * deep link arrives, the one-time token is redeemed for a WebView session and
 * the page reloads so the whole site comes up authenticated.
 */
export function registerAppAuthListener(onResult?: (ok: boolean) => void): void {
  if (listenerRegistered || !isNativeApp()) return;
  const App = getAppPlugin();
  if (!App) return;

  listenerRegistered = true;
  void App.addListener("appUrlOpen", async ({ url }: { url: string }) => {
    if (!url.startsWith(APP_DEEP_LINK_HOST)) return;
    let ok = false;
    try {
      const token = new URL(url).searchParams.get("token");
      if (token) {
        const res = await fetch(apiUrl("/api/auth/app-exchange") + `?token=${encodeURIComponent(token)}`, {
          credentials: "include",
        });
        ok = res.ok;
      }
    } catch {
      ok = false;
    }
    onResult?.(ok);
    // Full reload so every query (auth/me included) re-fetches with the new
    // session cookie. Lands on the site root; use-auth redirects from there.
    window.location.replace(ok ? "/" : "/login?error=session_failed");
  });
}

/**
 * Starts the Discord login. In the native app this hands off to the system
 * browser (deep-link return); on the web it's the unchanged full-page redirect.
 */
export function startDiscordLogin(): void {
  const loginUrl = apiUrl("/api/auth/discord");
  if (isNativeApp()) {
    const App = getAppPlugin();
    if (App) {
      void App.launchUrl({ url: `${loginUrl}?app=1`, openInSystemBrowser: true });
      return;
    }
  }
  window.location.href = loginUrl;
}
