/**
 * Client-side element → PNG (no external dependencies).
 *
 * Captures a rendered DOM node as a PNG by:
 *   1. cloning it and inlining every computed style (so the export doesn't
 *      depend on the page stylesheet);
 *   2. replacing <img> srcs with data URIs;
 *   3. wrapping the clone in an SVG <foreignObject> and drawing it to canvas.
 * If the SVG→canvas path is unavailable (rare browsers) it gracefully falls
 * back to downloading the SVG file instead.
 */

function inlineComputedStyles(sourceRoot: HTMLElement, targetRoot: HTMLElement) {
  const sourceNodes = [sourceRoot, ...Array.from(sourceRoot.querySelectorAll<HTMLElement>("*"))];
  const targetNodes = [targetRoot, ...Array.from(targetRoot.querySelectorAll<HTMLElement>("*"))];
  const count = Math.min(sourceNodes.length, targetNodes.length);
  for (let i = 0; i < count; i++) {
    const s = sourceNodes[i];
    const t = targetNodes[i];
    const cs = s && typeof s.getAttribute === "function" ? getComputedStyle(s) : null;
    if (!cs || !t) continue;
    for (let j = 0; j < cs.length; j++) {
      const prop = cs.item(j);
      if (!prop) continue;
      const value = cs.getPropertyValue(prop);
      if (!value) continue;
      try {
        t.style.setProperty(prop, value);
      } catch {
        /* ignore malformed / vendor props */
      }
    }
  }
}

async function inlineImages(root: HTMLElement) {
  const imgs = Array.from(root.querySelectorAll<HTMLImageElement>("img"));
  await Promise.all(
    imgs.map(async (img) => {
      const src = img.getAttribute("src") ?? "";
      if (!src || src.startsWith("data:")) return;
      const absolute =
        src.startsWith("http") || src.startsWith("//")
          ? src
          : new URL(src, window.location.href).href;
      try {
        const res = await fetch(absolute, { credentials: "same-origin" });
        if (!res.ok) return;
        const blob = await res.blob();
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(new Error("read failed"));
          reader.readAsDataURL(blob);
        });

        // Replace <img> with a <div background-image> because <img> inside SVG
        // <foreignObject> is not reliably rasterised by browsers during SVG→canvas.
        const div = document.createElement("div");
        const s = img.style;

        // Box model + shape (copied from the already-inlined styles)
        div.style.width = s.width || `${img.offsetWidth}px` || "100%";
        div.style.height = s.height || `${img.offsetHeight}px` || "100%";
        div.style.display = s.display || "block";
        div.style.margin = s.margin;
        div.style.padding = s.padding;
        div.style.border = s.border;
        div.style.borderRadius = s.borderRadius;
        div.style.boxSizing = s.boxSizing || "border-box";
        div.style.overflow = s.overflow || "hidden";
        div.style.position = s.position || "static";
        div.style.top = s.top;
        div.style.left = s.left;
        div.style.right = s.right;
        div.style.bottom = s.bottom;
        div.style.zIndex = s.zIndex;
        div.style.opacity = s.opacity;
        div.style.filter = s.filter;
        div.style.boxShadow = s.boxShadow;

        // Background image replaces the <img> src
        div.style.backgroundImage = `url("${dataUrl}")`;
        div.style.backgroundSize = s.objectFit || "cover";
        div.style.backgroundPosition = "center";
        div.style.backgroundRepeat = "no-repeat";

        // Preserve classes and any non-src attributes (e.g. aria-hidden)
        if (img.className) div.className = img.className;
        const skip = new Set(["src", "alt", "draggable", "loading", "decoding", "style", "class"]);
        for (let i = 0; i < img.attributes.length; i++) {
          const attr = img.attributes[i];
          if (attr && !skip.has(attr.name)) {
            div.setAttribute(attr.name, attr.value);
          }
        }

        img.replaceWith(div);
      } catch {
        /* keep the original src (remote image) */
      }
    }),
  );
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = document.createElement("img");
    img.onload = () => setTimeout(() => resolve(img), 30);
    img.onerror = () => reject(new Error("SVG rasterization failed"));
    img.src = src;
  });
}

function triggerDownload(dataUrl: string, filename: string) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename.endsWith(".png") ? filename : `${filename}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export async function downloadElementAsPng(el: HTMLElement, filename: string) {
  const width = Math.ceil(el.offsetWidth);
  const height = Math.ceil(el.offsetHeight);
  if (!width || !height) throw new Error("Card has no size yet");

  const clone = el.cloneNode(true) as HTMLElement;
  inlineComputedStyles(el, clone);
  await inlineImages(clone);

  const inner = new XMLSerializer().serializeToString(clone);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<foreignObject width="100%" height="100%">` +
    `<div xmlns="http://www.w3.org/1999/xhtml">${inner}</div>` +
    `</foreignObject></svg>`;
  const dataUrl = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);

  try {
    const img = await loadImage(dataUrl);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no 2d context");
    ctx.drawImage(img, 0, 0);
    triggerDownload(canvas.toDataURL("image/png"), filename);
  } catch {
    // Fallback: offer the SVG file itself so the card is still downloadable.
    const svgName = filename.replace(/\.png$/i, "") + ".svg";
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = svgName;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
}