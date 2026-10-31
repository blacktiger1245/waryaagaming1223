/**
 * Runner for the Stripe configuration check (test → live switch).
 *
 * Mirrors `run-route-e2e.mjs`: the check imports the API server's TypeScript
 * sources directly, so it is bundled with esbuild first, with `sharp`,
 * `tesseract.js` and `pino` kept external and the R2-backed object-storage
 * module replaced by the local stub.
 *
 * The check itself is offline: it never calls the Stripe API, never creates a
 * charge, and never queries the database. `DATABASE_URL` is only filled in with
 * a placeholder when unset, because `@workspace/db` throws at import time
 * without one — the pool it builds is never dialled.
 *
 * Usage: node test/run-stripe-config-check.mjs
 */
import { build } from "esbuild";
import { mkdir, rm } from "node:fs/promises";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.resolve(testDir, "..");

/**
 * Load the workspace `.env` (repo root, then the package) without adding a
 * dependency — the same parser as `run-route-e2e.mjs`, including the quote strip
 * so a hand-edited `KEY="value"` line is read the way the API server reads it.
 */
function loadEnvFile(file) {
  if (!existsSync(file)) return;
  for (const rawLine of readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvFile(path.resolve(serverDir, "..", "..", ".env"));
loadEnvFile(path.resolve(serverDir, ".env"));

// Placeholder only: the Stripe routes import `@workspace/db`, which throws at
// import time when no connection string is set. Nothing here queries it.
if (!process.env.NEON_DATABASE_URL && !process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgres://unused:unused@127.0.0.1:5432/unused";
}

const outDir = path.join(serverDir, "node_modules", ".wg-stripe-config-check");
await mkdir(outDir, { recursive: true });

/** Redirect imports of the R2-backed storage module to the local stub. */
const stubObjectStorage = {
  name: "stub-object-storage",
  setup(build) {
    build.onResolve({ filter: /lib[\\/]objectStorage(\.js)?$/ }, () => ({
      path: path.join(testDir, "stubs", "objectStorage.ts"),
    }));
  },
};

/** Redirect the pino logger to the console stub (see test/stubs/logger.ts). */
const stubLogger = {
  name: "stub-logger",
  setup(build) {
    build.onResolve({ filter: /lib[\\/]logger(\.js)?$/ }, () => ({
      path: path.join(testDir, "stubs", "logger.ts"),
    }));
  },
};

try {
  await build({
    entryPoints: [path.join(testDir, "stripe-config-check.ts")],
    outdir: outDir,
    platform: "node",
    bundle: true,
    format: "esm",
    logLevel: "warning",
    // Same externals as the route E2E runner: these load native/WASM/worker
    // assets by path and cannot live inside a single-file bundle.
    external: ["sharp", "tesseract.js", "*.node", "pino", "pino-http", "thread-stream"],
    plugins: [stubObjectStorage, stubLogger],
    banner: {
      js: `import { createRequire as __bannerCrReq } from 'node:module';
import __bannerPath from 'node:path';
import __bannerUrl from 'node:url';

globalThis.require = __bannerCrReq(import.meta.url);
globalThis.__filename = __bannerUrl.fileURLToPath(import.meta.url);
globalThis.__dirname = __bannerPath.dirname(globalThis.__filename);
`,
    },
  });

  // Run from the package root so module resolution matches the real server.
  process.chdir(serverDir);
  await import(pathToFileURL(path.join(outDir, "stripe-config-check.js")).href);
} finally {
  await rm(outDir, { recursive: true, force: true });
}
