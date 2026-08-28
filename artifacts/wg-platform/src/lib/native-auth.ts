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
  canOpenUrl(options: { url: string }): Promise<{ value: boolean }>;
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
 * Starts the Discord login. In the native app this hands off OUT of the
 * WebView (Discord blocks OAuth inside WebViews, so an in-WebView redirect
 * silently fails — the "button does nothing" bug); on the web it's the
 * unchanged full-page redirect to /auth/discord.
 *
 * Launch preference on Android (Discord-compatible, no invented schemes):
 *  1. If the Discord app is installed, it registers App Links for
 *     discord.com — so we first try a plain `launchUrl` WITHOUT forcing the
 *     system browser, letting Android's intent resolution pick the Discord
 *     app when it can handle the URL chain.
 *  2. Otherwise (or if that throws) we open in the system browser — Chrome
 *     Custom Tabs, the standard, Discord-supported OAuth surface.
 *  3. Last resort: navigate the WebView itself (better than a dead button).
 * The OAuth authorize URL is our own domain (/api/auth/discord), which the
 * Discord app does not claim — so in practice step 2 is what runs; step 1 is
 * attempted only via real Android intent resolution, never a fake
 * `discord://` URL (Discord's scheme is for servers/chats, not OAuth).
 */
export async function startDiscordLogin(): Promise<void> {
  const loginUrl = apiUrl("/api/auth/discord");
  if (isNativeApp()) {
    const App = getAppPlugin();
    if (App) {
      const url = `${loginUrl}?app=1`;
      // 1. Let Android resolve the URL natively (Discord app if it claims it).
      try {
        await App.launchUrl({ url, openInSystemBrowser: false });
        return;
      } catch {
        /* fall through */
      }
      // 2. System-browser fallback (Chrome Custom Tabs) — always Discord-safe.
      try {
        await App.launchUrl({ url, openInSystemBrowser: true });
        return;
      } catch {
        /* fall through */
      }
    }
  }
  // 3. Web (unchanged desktop behavior) or absolute last resort in-app.
  window.location.href = loginUrl;
}
