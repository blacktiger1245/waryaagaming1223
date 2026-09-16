/**
 * Runner for the OCR verification test.
 *
 * `test/ocr-check.ts` imports the API server's TypeScript sources directly, so it
 * is bundled with esbuild first (mirroring `build.mjs`: `sharp` and `tesseract.js`
 * stay external because they load native/WASM assets at runtime) and then run.
 *
 * The bundle is written *inside* the package (`node_modules/.wg-ocr-check/`) rather
 * than to the OS temp directory: `sharp` and `tesseract.js` are external, so Node
 * resolves them by walking up from the bundle's location and must be able to reach
 * this package's `node_modules`.
 *
 * Usage: node test/run-ocr-check.mjs [path-to-screenshot.png]
 */
import { build } from "esbuild";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.resolve(testDir, "..");
const outDir = path.join(serverDir, "node_modules", ".wg-ocr-check");
await mkdir(outDir, { recursive: true });

try {
  const outfile = path.join(outDir, "ocr-check.mjs");
  await build({
    entryPoints: [path.join(testDir, "ocr-check.ts")],
    outfile,
    platform: "node",
    bundle: true,
    format: "esm",
    logLevel: "warning",
    external: ["sharp", "tesseract.js", "*.node"],
    banner: {
      js: `import { createRequire as __cr } from 'node:module';
globalThis.require = __cr(import.meta.url);`,
    },
  });

  // Run from the package root so relative fixture paths and the tesseract.js
  // language cache both resolve the same way they do in production.
  process.chdir(serverDir);
  await import(pathToFileURL(outfile).href);
} finally {
  await rm(outDir, { recursive: true, force: true });
}
