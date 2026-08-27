import { defineConfig } from "@capacitor/cli";

/**
 * Waryaa Gaming Android app (Capacitor).
 *
 * Coexistence design:
 *  - This app loads the EXISTING production website in its WebView
 *    (server.url below), so auth, session, fixtures, Live list, watching and
 *    the whole UI are reused exactly as deployed. No site re-hosting.
 *  - It adds one native capability the mobile web cannot do: MediaProjection
 *    screen capture, published through the SAME /api/live/broadcast/* signaling
 *    the web broadcaster uses. Viewers on the website watch a phone broadcast
 *    exactly like any other.
 *
 * Build-time value (override if your domain differs):
 *   VITE_SITE_URL – public URL of the existing website, e.g.
 *                   https://p01--waryaagaming1223--w5kk4bgjlsdp.code.run
 */
const siteUrl = (
  process.env.VITE_SITE_URL ??
  "https://p01--waryaagaming1223--w5kk4bgjlsdp.code.run"
).replace(/\/$/, "");

export default defineConfig({
  appId: "com.waryaa.gaming",
  appName: "Waryaa Gaming",
  webDir: "www",
  server: {
    url: siteUrl,
    // Load the remote site inside the app's WebView; Capacitor still injects
    // its bridge so the page can call the native ScreenCast plugin.
    cleartext: false,
    androidScheme: "https",
  },
  android: {
    allowMixedContent: true,
  },
  ios: {
    // iOS is out of scope (Android-only per the task) — left for future work.
  },
});