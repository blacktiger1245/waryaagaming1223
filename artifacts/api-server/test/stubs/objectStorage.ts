/**
 * Test-only stand-in for `src/lib/objectStorage.ts`.
 *
 * The real implementation talks to Cloudflare R2 and therefore needs
 * `R2_ENDPOINT` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET_NAME`.
 * Those are external infrastructure credentials, so the route E2E test swaps this
 * module in (via an esbuild resolve plugin in `run-route-e2e.mjs`) and persists
 * uploads to a temp directory instead.
 *
 * Only object *storage* is stubbed — image validation (`validateUploadedImage`
 * and `sharp`-backed `assertSafeImage`) always runs for real, so the security
 * assertions in the test still exercise the production code path.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
  }
}

/** Temp directory the stub writes uploads to. Exported so the test can assert on it. */
export const STUB_UPLOAD_DIR = path.join(process.cwd(), "node_modules", ".wg-route-e2e-uploads");

/** Every `/objects/...` path handed out, in order — lets the test prove storage happened. */
export const stubStoredObjects: { path: string; bytes: number; contentType: string }[] = [];

export class ObjectStorageService {
  async getObjectEntityUploadURL(): Promise<string> {
    throw new Error("Not used by the match-result flow");
  }

  async uploadObject(body: Uint8Array, contentType: string): Promise<string> {
    await mkdir(STUB_UPLOAD_DIR, { recursive: true });
    const key = `uploads/${randomUUID()}`;
    await writeFile(path.join(STUB_UPLOAD_DIR, path.basename(key)), Buffer.from(body));
    stubStoredObjects.push({ path: `/objects/${key}`, bytes: body.byteLength, contentType });
    return `/objects/${key}`;
  }

  normalizeObjectEntityPath(rawPath: string): string {
    return rawPath;
  }

  async getObjectEntityFile(objectPath: string): Promise<{ bucket: string; key: string }> {
    return { bucket: "stub", key: objectPath.replace(/^\/objects\//, "") };
  }

  async downloadObject(): Promise<Response> {
    return new Response(null, { status: 404 });
  }

  async trySetObjectEntityAclPolicy(rawPath: string): Promise<string> {
    return rawPath;
  }

  async canAccessObjectEntity(): Promise<boolean> {
    return true;
  }

  async deleteObjectByEntityPath(): Promise<boolean> {
    return true;
  }
}
