import { useEffect } from "react";
import { X } from "lucide-react";

/**
 * Fullscreen image viewer with an explicit X close button.
 * Opens on top of the page (no navigation / new tab), so the user can always
 * close it and return to where they were. Closes on X, ESC, or clicking the
 * dark backdrop.
 */
export function ImageLightbox({
  src,
  alt,
  onClose,
}: {
  src: string | null | undefined;
  alt?: string;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!src) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [src, onClose]);

  if (!src) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Image preview"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close image"
        data-testid="button-close-lightbox"
        className="absolute right-4 top-4 z-10 flex size-11 items-center justify-center rounded-full border border-white/20 bg-black/70 text-white transition-colors hover:bg-black"
      >
        <X className="h-6 w-6" />
      </button>
      <img
        src={src}
        alt={alt ?? ""}
        onClick={(e) => e.stopPropagation()}
        className="max-h-full max-w-full rounded-lg object-contain shadow-2xl"
      />
    </div>
  );
}
