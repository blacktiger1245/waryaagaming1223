/**
 * Runner for the match-result route end-to-end test.
 *
 * Mirrors `build.mjs`/`run-ocr-check.mjs`: the test imports the API server's
 * TypeScript sources directly, so it is bundled with esbuild first. Two things
 * differ from a plain bundle:
 *
 *   1. `sharp` and `tesseract.js` stay external (they load native/WASM assets).
 *   2. `src/lib/objectStorage.ts` is swapped for `test/stubs/objectStorage.ts`,
 *      because the real implementation requires Cloudflare R2 credentials that are
 *      external infrastructure. Only object storage is stubbed — image validation
 *      and OCR run for real.
 *
 * The bundle is written inside the package so Node can resolve the external
 * dependencies from this package's `node_modules`.
 *
 * Usage: node test/run-route-e2e.mjs
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
 * dependency. The test needs a real `DATABASE_URL`; forcing the operator to
 * export it by hand made the suite easy to run incorrectly.
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

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Add it to the workspace .env before running this test.");
  process.exit(1);
}

const outDir = path.join(serverDir, "node_modules", ".wg-route-e2e");
await mkdir(outDir, { recursive: true });

/**
 * Redirect imports of the R2-backed storage module to the local stub.
 * The source imports carry a `.js` extension (NodeNext ESM style), so the
 * filter has to accept both `../lib/objectStorage` and `../lib/objectStorage.js`.
 */
const stubObjectStorage = {
  name: "stub-object-storage",
  setup(build) {
    build.onResolve({ filter: /lib[\\/]objectStorage(\.js)?$/ }, () => ({
      path: path.join(testDir, "stubs", "objectStorage.ts"),
    }));
  },
};

/** Redirect the pino logger to a console stub (see test/stubs/logger.ts). */
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
    entryPoints: [path.join(testDir, "route-e2e.ts")],
    outdir: outDir,
    platform: "node",
    bundle: true,
    format: "esm",
    logLevel: "warning",
    // `pino`/`pino-http` stay external too: their `thread-stream` worker resolves
    // relative to the bundle directory, which breaks inside `node_modules/.wg-route-e2e`.
    // (The logger module itself is replaced by the stub above.)
    external: ["sharp", "tesseract.js", "*.node", "pino", "pino-http", "thread-stream"],
    plugins: [stubObjectStorage, stubLogger],
    // Mirror `build.mjs`: pino's thread-stream worker and other CJS-only deps need
    // `require`/`__dirname`/`__filename` in the ESM output.
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

  // Run from the package root so relative fixture paths and the tesseract.js
  // language cache resolve exactly as they do in production.
  process.chdir(serverDir);
  await import(pathToFileURL(path.join(outDir, "route-e2e.js")).href);
} finally {
  await rm(outDir, { recursive: true, force: true });
}