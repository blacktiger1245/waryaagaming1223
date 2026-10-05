/**
 * Cross-platform image saving (PNG cards, award cards, exports …).
 *
 * The previous approach — an `<a download>` pointing straight at a multi-megabyte
 * `data:` URL — works on desktop but silently fails on phones:
 *   • Android Chrome refuses to download very large `data:` URLs.
 *   • iOS Safari (and iOS Chrome/Firefox) ignore the `download` attribute for
 *     `data:` URLs and simply try to open them, and blob downloads are flaky.
 *
 * This helper normalises everything to a `Blob` and then picks the best
 * strategy for the device the visitor is actually using:
 *   1. iOS  → the native share sheet ("Save Image" → Photos / "Save to Files")
 *             when available, otherwise the PNG is opened in a new tab so it can
 *             be long-pressed and saved.
 *   2. Other (desktop, Android, …) → a blob object-URL download.
 *   3. If the download throws, open the image in a new tab as a last resort.
 */

import { toast } from "@/hooks/use-toast";

export type SaveOutcome = "shared" | "downloaded" | "opened";

/** True on iPhone / iPad / iPod (incl. iPadOS, which reports itself as a Mac). */
export function isIosDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const iOS = /iPad|iPhone|iPod/.test(ua);
  const iPadOs = navigator.platform === "MacIntel" && (navigator.maxTouchPoints ?? 0) > 1;
  return iOS || iPadOs;
}

/** Coarse device detection — used only to decide between download vs share. */
export function isMobileDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  return (
    isIosDevice() ||
    /Android|webOS|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(navigator.userAgent || "")
  );
}

/** Convert a (base64 or URL-encoded) data URL into a Blob. */
export function dataUrlToBlob(dataUrl: string): Blob {
  const comma = dataUrl.indexOf(",");
  if (!dataUrl.startsWith("data:") || comma === -1) throw new Error("Not a data URL");
  const meta = dataUrl.slice(0, comma);
  const payload = dataUrl.slice(comma + 1);
  const mime = /^data:([^;,]+)/.exec(meta)?.[1] || "image/png";
  if (/;base64/i.test(meta)) {
    const binary = atob(payload);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  }
  return new Blob([decodeURIComponent(payload)], { type: mime });
}

/** Rasterise a `<canvas>` to a Blob (with a data-URL fallback for old engines). */
export function canvasToBlob(canvas: HTMLCanvasElement, type = "image/png"): Promise<Blob> {
  return new Promise((resolve, reject) => {
    if (typeof canvas.toBlob === "function") {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("Canvas export failed"))),
        type,
      );
      return;
    }
    try {
      resolve(dataUrlToBlob(canvas.toDataURL(type)));
    } catch (err) {
      reject(err instanceof Error ? err : new Error("Canvas export failed"));
    }
  });
}

function withExtension(filename: string): string {
  return /\.[a-z0-9]{2,5}$/i.test(filename) ? filename : `${filename}.png`;
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Keep the object URL alive long enough for slow mobile browsers to save it.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function openImageInNewTab(blob: Blob) {
  const url = URL.createObjectURL(blob);
  const win = window.open(url, "_blank");
  if (!win) {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.target = "_blank";
    anchor.rel = "noopener";
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

async function shareFile(blob: Blob, filename: string): Promise<boolean> {
  const nav = navigator as unknown as {
    share?: (data: { files: File[]; title?: string; text?: string }) => Promise<void>;
    canShare?: (data: { files?: File[] }) => boolean;
  };
  if (typeof nav.share !== "function" || typeof nav.canShare !== "function") return false;
  try {
    const file = new File([blob], filename, { type: blob.type || "image/png" });
    if (!nav.canShare({ files: [file] })) return false;
    await nav.share({ files: [file], title: filename });
    return true;
  } catch (err) {
    // AbortError = the visitor dismissed the sheet; that still counts as handled.
    return err instanceof DOMException && err.name === "AbortError";
  }
}

/**
 * Save an image to the visitor's device. Accepts a data URL or an existing Blob.
 * Always resolves — call `notifySaveOutcome` to tell the visitor what happened.
 */
export async function saveImage(source: string | Blob, filename: string): Promise<SaveOutcome> {
  const name = withExtension(filename);

  let blob: Blob;
  if (typeof source === "string") {
    try {
      blob = dataUrlToBlob(source);
    } catch {
      // Non-standard data URL (e.g. charset-encoded SVG) — let the browser parse it.
      blob = await fetch(source).then((r) => r.blob());
    }
  } else {
    blob = source;
  }
  if (!blob.type) blob = new Blob([blob], { type: "image/png" });

  // 1) iOS: blob downloads are unreliable — prefer the native share sheet, which
  //    offers "Save Image" (to Photos) / "Save to Files".
  if (isIosDevice()) {
    if (await shareFile(blob, name)) return "shared";
    // No share sheet available: open the PNG so it can be long-pressed + saved.
    openImageInNewTab(blob);
    return "opened";
  }

  // 2) Desktop, Android and modern mobile browsers: direct blob-URL download.
  try {
    triggerBlobDownload(blob, name);
    return "downloaded";
  } catch {
    // 3) Last resort: open the PNG so it can be long-pressed → "Save Image".
    openImageInNewTab(blob);
    return "opened";
  }
}

/** Show a short toast describing how the save went. */
export function notifySaveOutcome(outcome: SaveOutcome) {
  if (outcome === "downloaded") {
    toast({ title: "Image saved", description: "Check your device's Downloads." });
  } else if (outcome === "opened") {
    toast({
      title: "Image ready",
      description: "Long-press the image and choose “Save Image” to keep it.",
    });
  }
  // "shared" → the share sheet is its own feedback, so stay quiet.
}
