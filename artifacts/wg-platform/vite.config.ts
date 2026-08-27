import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

// PORT is required in dev/preview mode; during `vite build` (e.g. on Vercel CI)
// it is not used, so we fall back to 3000 rather than failing the build.
const rawPort = process.env.PORT;
const port = rawPort ? Number(rawPort) : 3000;

if (rawPort && (Number.isNaN(port) || port <= 0)) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// BASE_PATH defaults to "/" on hosts that serve the frontend at the domain root
// (Vercel, Railway, Render, VPS). Replit sets this explicitly via the artifact config.
const basePath = process.env.BASE_PATH ?? "/";

// Dev/preview proxy target for same-origin /api calls. Browsers block WebRTC
// and camera/screen APIs on plain HTTP, so the dev server runs over HTTPS
// (basic-ssl) and proxies API traffic to the backend — phones then only need
// to open https://<dev-machine-ip>:<port>.
const apiProxyTarget = process.env.API_PROXY_TARGET ?? "http://127.0.0.1:5000";
const apiProxy = {
  target: apiProxyTarget,
  // Adds x-forwarded-for/-host/-proto so the API's origin check accepts the
  // browser's https origin (requestOrigin() reads the forwarded headers).
  xfwd: true,
};

// Self-signed HTTPS for dev/preview so phones on the same network get a
// secure context (required for WebRTC, camera and screen capture). The
// package is intentionally NOT in package.json — adding it without updating
// pnpm-lock.yaml breaks `pnpm install --frozen-lockfile` in the Docker build.
// To enable local HTTPS phone testing, run (needs internet):
//   pnpm -C artifacts/wg-platform add -D @vitejs/plugin-basic-ssl
// Production deployments are already HTTPS at the edge and skip it entirely.
const basicSslPlugin: import("vite").Plugin | null = await import(
  "@vitejs/plugin-basic-ssl" as string
)
  .then((m) => (m as { default: () => import("vite").Plugin }).default())
  .catch(() => null);

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
    // Optional self-signed HTTPS (see note above basicSslPlugin).
    ...(basicSslPlugin ? [basicSslPlugin] : []),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, ".."),
            }),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "../../dist"),
    emptyOutDir: true,
  },
  server: {
    port,
    strictPort: true,
    host: "0.0.0.0",
    allowedHosts: true,
    proxy: {
      "/api": apiProxy,
    },
    fs: {
      strict: true,
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
    proxy: {
      "/api": apiProxy,
    },
  },
});
