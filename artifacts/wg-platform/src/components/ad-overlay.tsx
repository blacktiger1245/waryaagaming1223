import { useEffect, useRef, useState, useCallback } from "react";
import { X, MousePointerClick } from "lucide-react";
import { apiUrl, storageUrl } from "@/lib/api";

interface ActiveAd {
  id: number;
  videoUrl: string;
  targetUrl: string;
  closeAfterSeconds: number;
}

/**
 * Interstitial advertisement overlay.
 *
 * Fetches the single active advertisement once (per mount, i.e. once per page
 * load) and renders it above the whole website. The background is blocked while
 * the ad is shown. The close button only appears after the configured
 * countdown reaches zero. Clicking the ad opens the target URL in a new tab
 * using only http/https schemes. All timers and object URLs are cleaned up on
 * unmount so nothing leaks.
 */
export function AdOverlay() {
  const [ad, setAd] = useState<ActiveAd | null>(null);
  const [loading, setLoading] = useState(true);
  const [remaining, setRemaining] = useState(0);
  const [canClose, setCanClose] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const fetchGuard = useRef(false);

  // Fetch the active ad exactly once.
  useEffect(() => {
    if (fetchGuard.current) return;
    fetchGuard.current = true;

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(apiUrl("/api/ads/active"), { credentials: "include" });
        if (!res.ok) throw new Error("ad request failed");
        const data = (await res.json()) as { ad: ActiveAd | null };
        if (cancelled) return;
        if (data.ad && data.ad.closeAfterSeconds > 0) {
          setAd(data.ad);
          setRemaining(data.ad.closeAfterSeconds);
        }
      } catch {
        // Public ad request failed — never block the website, just show nothing.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Countdown timer — cleaned up when the overlay closes or unmounts.
  useEffect(() => {
    if (!ad) return;
    setCanClose(false);

    const interval = window.setInterval(() => {
      setRemaining((prev) => {
        const next = prev - 1;
        if (next <= 0) {
          window.clearInterval(interval);
          setCanClose(true);
          return 0;
        }
        return next;
      });
    }, 1000);

    return () => window.clearInterval(interval);
  }, [ad]);

  // Lock body scroll while the overlay is visible (keeps background unusable).
  useEffect(() => {
    if (!ad) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [ad]);

  const openTarget = useCallback(() => {
    if (!ad) return;
    try {
      const url = new URL(ad.targetUrl);
      if (url.protocol !== "http:" && url.protocol !== "https:") return;
      window.open(url.toString(), "_blank", "noopener,noreferrer");
    } catch {
      // Invalid/unsafe URL — ignore.
    }
  }, [ad]);

  if (loading) return null;
  if (!ad) return null;

  const videoSrc = storageUrl(ad.videoUrl);

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Advertisement"
      data-testid="ad-overlay"
    >
      <div className="relative w-full max-w-3xl overflow-hidden rounded-2xl border border-primary/40 bg-card shadow-2xl glow-primary" style={{ maxHeight: "92dvh" }}>
        {/* Header bar */}
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border bg-sidebar/60">
          <div className="flex items-center gap-2 min-w-0">
            <span className="flex h-2.5 w-2.5 shrink-0 rounded-full bg-primary animate-pulse" />
            <span className="text-xs font-black uppercase tracking-[0.2em] text-primary">Sponsored</span>
            <span className="text-xs text-muted-foreground hidden sm:inline truncate">Advertisement</span>
          </div>

          {canClose ? (
            <button
              onClick={() => setAd(null)}
              aria-label="Close advertisement"
              data-testid="ad-close-button"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-destructive text-destructive-foreground transition-transform hover:scale-105 active:scale-95"
            >
              <X className="h-5 w-5" />
            </button>
          ) : (
            <div
              data-testid="ad-countdown"
              className="flex h-10 shrink-0 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-black text-foreground"
            >
              <span className="text-muted-foreground font-bold">Close in</span>
              <span className="min-w-[1.5rem] text-center text-primary glow-text">{remaining > 0 ? remaining : 0}</span>
            </div>
          )}
        </div>

        {/* Clickable video */}
        <button
          type="button"
          onClick={openTarget}
          className="block w-full cursor-pointer bg-black text-left"
          data-testid="ad-video-click"
        >
          {videoSrc ? (
            <video
              ref={videoRef}
              src={videoSrc}
              autoPlay
              muted
              playsInline
              loop
              preload="auto"
              className="block h-auto max-h-[58dvh] w-full object-contain"
              data-testid="ad-video"
            />
          ) : (
            <div className="flex h-56 w-full items-center justify-center text-muted-foreground">
              Advertisement
            </div>
          )}
        </button>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-border bg-sidebar/40">
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            <MousePointerClick className="h-4 w-4" />
            Tap to visit advertiser
          </span>
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/70">
            Waryaa Gaming
          </span>
        </div>
      </div>
    </div>
  );
}