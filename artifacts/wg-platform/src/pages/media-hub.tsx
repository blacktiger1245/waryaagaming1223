import { useMemo, useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import {
  Youtube,
  Instagram,
  Facebook,
  Music2,
  Search,
  RefreshCw,
  ExternalLink,
  Eye,
  ThumbsUp,
  MessageCircle,
  Share2,
  Clock,
  Play,
  Check,
  Clapperboard,
  Sparkles,
  Bell,
  BellDot,
  X,
  ArrowRight,
  Flame,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { apiUrl } from "@/lib/api";

type Platform = "youtube" | "tiktok" | "instagram" | "facebook";
type PlatformFilter = Platform | "all";

interface MediaHubItem {
  id: string;
  platform: Platform;
  contentType: string;
  title: string;
  caption?: string;
  thumbnailUrl?: string;
  originalMediaUrl?: string;
  publishedAt?: string;
  views?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  author?: string;
  channelName?: string;
  durationSeconds?: number;
  verified?: boolean;
}

interface HubResponse {
  channels: Record<Platform, string>;
  items: MediaHubItem[];
  configured: Record<Platform, boolean>;
  errors: Record<string, string>;
}

const PLATFORMS: Platform[] = ["youtube", "tiktok", "instagram", "facebook"];

const FILTERS: { value: PlatformFilter; label: string }[] = [
  { value: "all", label: "ALL" },
  { value: "youtube", label: "YouTube" },
  { value: "tiktok", label: "TikTok" },
  { value: "instagram", label: "Instagram" },
  { value: "facebook", label: "Facebook" },
];

const META: Record<
  Platform,
  { label: string; icon: typeof Youtube; text: string; chip: string; thumbBg: string }
> = {
  youtube: {
    label: "YouTube",
    icon: Youtube,
    text: "text-red-400",
    chip: "bg-red-500/15 border-red-400/25 text-red-300",
    thumbBg: "bg-gradient-to-br from-red-900/40 to-red-950/60",
  },
  tiktok: {
    label: "TikTok",
    icon: Music2,
    text: "text-fuchsia-300",
    chip: "bg-fuchsia-500/15 border-fuchsia-400/25 text-fuchsia-200",
    thumbBg: "bg-gradient-to-br from-fuchsia-900/40 to-zinc-950/60",
  },
  instagram: {
    label: "Instagram",
    icon: Instagram,
    text: "text-pink-400",
    chip: "bg-pink-500/15 border-pink-400/25 text-pink-300",
    thumbBg: "bg-gradient-to-br from-pink-900/40 to-orange-900/40",
  },
  facebook: {
    label: "Facebook",
    icon: Facebook,
    text: "text-blue-400",
    chip: "bg-blue-500/15 border-blue-400/25 text-blue-300",
    thumbBg: "bg-gradient-to-br from-blue-900/40 to-indigo-950/60",
  },
};

const EMPTY_CHANNELS: Record<Platform, string> = {
  youtube: "",
  tiktok: "",
  instagram: "",
  facebook: "",
};

function formatNumber(n: number | undefined): string | null {
  if (n === undefined || n === null || Number.isNaN(n)) return null;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(n);
}

function timeAgo(iso: string | undefined): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const seconds = Math.floor((Date.now() - t) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 2592000) return `${Math.floor(seconds / 86400)}d ago`;
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDuration(seconds: number | undefined): string {
  if (seconds === undefined || seconds === null || Number.isNaN(seconds)) return "";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}
// ── MediaCard ────────────────────────────────────────────────────────────────
// Always tries to open the EXACT original post. If the platform didn't return a
// real permalink, the card is rendered but the external action is disabled
// (no file:// homepage fallbacks, no fake navigation).
const LS_KEY = "wg-media-hub-last-seen";
function getLastSeen(): string { try { return localStorage.getItem(LS_KEY) ?? ""; } catch { return ""; } }
function setLastSeen(iso: string) { try { localStorage.setItem(LS_KEY, iso); } catch { /* ignore */ } }
function checkIsNew(item: MediaHubItem, lastSeen: string): boolean {
  if (!item.publishedAt) return false;
  if (!lastSeen) return true;
  return item.publishedAt > lastSeen;
}

function useClickOutside(ref: React.RefObject<HTMLElement | null>, handler: () => void) {
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) handler();
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [ref, handler]);
}

function LatestSpotlight({
  items,
  channels,
  lastSeen,
}: {
  items: MediaHubItem[];
  channels: Record<Platform, string>;
  lastSeen: string;
}) {
  const latestByPlatform = useMemo(() => {
    const map = new Map<Platform, MediaHubItem>();
    // Sort all items by publishedAt descending
    const sorted = [...items].sort(
      (a, b) => String(b.publishedAt ?? "").localeCompare(String(a.publishedAt ?? ""))
    );
    for (const item of sorted) {
      if (!map.has(item.platform)) {
        map.set(item.platform, item);
      }
    }
    return PLATFORMS.map((p) => ({ platform: p, item: map.get(p) })).filter(
      (x): x is { platform: Platform; item: MediaHubItem } => !!x.item
    );
  }, [items]);

  if (latestByPlatform.length === 0) return null;

  return (
    <FadeUp delay={0.06} className="mb-10">
      <div className="mb-5 flex items-center gap-2">
        <Flame className="h-4 w-4 text-amber-400" />
        <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-zinc-400">
          Fresh Uploads
        </span>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {latestByPlatform.map(({ platform: p, item }) => {
          const meta = META[p];
          const Icon = meta.icon;
          const isNew = checkIsNew(item, lastSeen);
          return (
            <a
              key={item.id}
              href={item.originalMediaUrl ?? undefined}
              target="_blank"
              rel="noopener noreferrer"
              className="group relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.06] to-transparent transition-all duration-300 hover:-translate-y-1 hover:border-fuchsia-400/40 hover:shadow-[0_16px_48px_-12px_rgba(217,70,239,0.4)]"
            >
              {/* Thumbnail */}
              <div className={`relative aspect-video w-full overflow-hidden ${meta.thumbBg}`}>
                {item.thumbnailUrl ? (
                  <img
                    src={item.thumbnailUrl}
                    alt={item.title}
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <Icon className="h-12 w-12 text-white/20" />
                  </div>
                )}
                {/* Platform badge */}
                <span
                  className={`absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wider backdrop-blur ${meta.chip}`}
                >
                  <Icon className="h-3 w-3" />
                  {meta.label}
                </span>
                {/* NEW badge */}
                {isNew && (
                  <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-fuchsia-500 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-white shadow-[0_0_12px_rgba(217,70,239,0.7)]">
                    <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" /> New
                  </span>
                )}
                {/* Play overlay */}
                <span className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                  <span className="flex h-14 w-14 items-center justify-center rounded-full bg-black/70 text-white backdrop-blur ring-2 ring-fuchsia-400/50">
                    <Play className="h-6 w-6 fill-current" />
                  </span>
                </span>
                {/* Duration */}
                {item.durationSeconds != null && (
                  <span className="absolute bottom-3 right-3 rounded bg-black/80 px-2 py-0.5 text-[10px] font-bold text-white">
                    {formatDuration(item.durationSeconds)}
                  </span>
                )}
              </div>

              {/* Info */}
              <div className="p-4">
                <h3 className="line-clamp-2 text-sm font-bold text-white transition-colors group-hover:text-fuchsia-200">
                  {item.title}
                </h3>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-zinc-500">
                  {item.views != null && (
                    <span className="flex items-center gap-1">
                      <Eye className="h-3 w-3" /> {formatNumber(item.views)}
                    </span>
                  )}
                  {item.likes != null && (
                    <span className="flex items-center gap-1">
                      <ThumbsUp className="h-3 w-3" /> {formatNumber(item.likes)}
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" /> {timeAgo(item.publishedAt)}
                  </span>
                </div>
                <div className="mt-3 flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-fuchsia-300 transition-colors group-hover:text-fuchsia-200">
                  Watch Now <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                </div>
              </div>
            </a>
          );
        })}
      </div>
    </FadeUp>
  );
}

function MediaCard({ item, delay, isNew = false }: { item: MediaHubItem; delay: number; isNew?: boolean }) {
  const meta = META[item.platform];
  const Icon = meta.icon;
  const url = item.originalMediaUrl && /^https:\/\//.test(item.originalMediaUrl)
    ? item.originalMediaUrl
    : null;

  const aspect =
    item.platform === "youtube"
      ? "aspect-video"
      : item.platform === "tiktok"
        ? "aspect-[9/16]"
        : "aspect-square";

  const content = (
    <div className="wg-sheen group wg-card h-full rounded-2xl border border-fuchsia-400/15 bg-gradient-to-b from-fuchsia-500/[0.06] to-transparent p-3 backdrop-blur transition-all duration-300 hover:-translate-y-1 hover:border-fuchsia-400/40 hover:shadow-[0_12px_44px_-14px_rgba(217,70,239,0.5)]">
      {/* Media preview */}
      <div className={`relative w-full ${aspect} overflow-hidden rounded-xl ${meta.thumbBg}`}>
        {isNew && (
          <span className="absolute left-2 top-2 z-10 inline-flex items-center gap-1 rounded-full bg-fuchsia-500 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-white shadow-[0_0_12px_rgba(217,70,239,0.7)]">
            <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" /> New
          </span>
        )}
        {item.thumbnailUrl ? (
          <img
            src={item.thumbnailUrl}
            alt={item.title}
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <Icon className="h-10 w-10 text-white/25" />
          </div>
        )}

        {item.platform === "youtube" && (
          <>
            <span className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur ring-2 ring-fuchsia-400/40">
                <Play className="h-5 w-5 fill-current" />
              </span>
            </span>
            {item.durationSeconds != null && (
              <span className="absolute bottom-2 right-2 rounded bg-black/80 px-1.5 py-0.5 text-[10px] font-bold text-white">
                {formatDuration(item.durationSeconds)}
              </span>
            )}
          </>
        )}
      </div>

      {/* Body */}
      <div className="px-1 pb-1 pt-3">
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${meta.chip}`}>
          <Icon className="h-3 w-3" />
          {meta.label}
        </span>

        <h3 className="mt-2 line-clamp-2 text-sm font-bold text-white transition-colors group-hover:text-fuchsia-200">
          {item.title}
        </h3>

        {item.caption && (
          <p className="mt-1 line-clamp-2 text-xs text-zinc-400">{item.caption}</p>
        )}

        {(item.author || item.channelName) && (
          <p className="mt-1.5 flex items-center gap-1 text-[11px] text-zinc-500">
            <span className="truncate">{item.author || item.channelName}</span>
            {item.verified && (
            <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-fuchsia-500/30 text-fuchsia-300">
                <Check className="h-2.5 w-2.5" />
              </span>
            )}
          </p>
        )}

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-zinc-500">
          {item.views != null && (
            <span className="flex items-center gap-1">
              <Eye className="h-3 w-3" /> {formatNumber(item.views)}
            </span>
          )}
          {item.likes != null && (
            <span className="flex items-center gap-1">
              <ThumbsUp className="h-3 w-3" /> {formatNumber(item.likes)}
            </span>
          )}
          {item.comments != null && (
            <span className="flex items-center gap-1">
              <MessageCircle className="h-3 w-3" /> {formatNumber(item.comments)}
            </span>
          )}
          {item.shares != null && (
            <span className="flex items-center gap-1">
              <Share2 className="h-3 w-3" /> {formatNumber(item.shares)}
            </span>
          )}
          {timeAgo(item.publishedAt) && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" /> {timeAgo(item.publishedAt)}
            </span>
          )}
        </div>

        <div className="mt-3 flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider">
          {url ? (
            <span className="flex items-center gap-1 text-fuchsia-300">
              Open {meta.label} <ExternalLink className="h-3 w-3" />
            </span>
          ) : (
            <span className="text-zinc-600">Original unavailable</span>
          )}
        </div>
      </div>
    </div>
  );

  if (url) {
    return (
      <motion.a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        initial={{ opacity: 0, y: 18 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-40px" }}
        transition={{ duration: 0.45, delay, ease: [0.22, 1, 0.36, 1] }}
      >
        {content}
      </motion.a>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.45, delay, ease: [0.22, 1, 0.36, 1] }}
      className="cursor-not-allowed"
    >
      {content}
    </motion.div>
  );
}
// ── Empty tile for a platform with no retrievable content ────────────────────
function PlatformEmpty({
  platform,
  configured,
  channelUrl,
}: {
  platform: Platform;
  configured: boolean;
  channelUrl?: string;
}) {
  const meta = META[platform];
  const Icon = meta.icon;
  return (
    <FadeUp>
      <div className="flex h-full min-h-[220px] flex-col items-center justify-center rounded-2xl border border-dashed border-white/15 bg-white/[0.02] p-8 text-center">
        <Icon className={`h-9 w-9 ${meta.text} opacity-70`} />
        {configured ? (
          <p className="mt-4 text-sm font-bold text-zinc-300">
            No {meta.label} content available right now.
          </p>
        ) : (
          <>
            <p className="mt-4 text-sm font-bold text-zinc-300">
              {meta.label} feed isn't connected yet.
            </p>
            <p className="mt-1 max-w-xs text-xs text-zinc-500">
              Once credentials are configured, WG's latest {meta.label} posts will appear
              here automatically.
            </p>
            {channelUrl && (
              <a
                href={channelUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={`mt-4 inline-flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-[11px] font-bold uppercase tracking-wider ${meta.chip}`}
              >
                <Icon className="h-3.5 w-3.5" /> Visit {meta.label}
              </a>
            )}
          </>
        )}
      </div>
    </FadeUp>
  );
}

function FadeUp({
  children,
  delay = 0,
  className = "",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.55, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

function MediaNotificationBell({
  items,
  onOpenItem,
}: {
  items: MediaHubItem[];
  onOpenItem: (platform: Platform) => void;
}) {
  const [open, setOpen] = useState(false);
  const [lastSeen, setLastSeenState] = useState<string>(getLastSeen);
  const panelRef = useRef<HTMLDivElement>(null);
  useClickOutside(panelRef, () => setOpen(false));

  const newItems = useMemo(
    () => items.filter((i) => checkIsNew(i, lastSeen)).slice(0, 12),
    [items, lastSeen]
  );
  const count = newItems.length;

  const markAllRead = useCallback(() => {
    const newest = items
      .map((i) => i.publishedAt)
      .filter(Boolean)
      .sort((a, b) => String(b).localeCompare(String(a)))[0];
    if (newest) { setLastSeen(newest); setLastSeenState(newest); }
    setOpen(false);
  }, [items]);

  return (
    <div ref={panelRef} className="relative">
      <button
        onClick={() => setOpen((p) => !p)}
        className="relative inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/15 bg-white/[0.04] text-zinc-300 transition-colors hover:border-fuchsia-400/40 hover:text-white"
        aria-label="Notifications"
      >
        {count > 0 ? <BellDot className="h-5 w-5 text-fuchsia-300" /> : <Bell className="h-5 w-5" />}
        {count > 0 && (
          <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-fuchsia-500 px-1 text-[10px] font-black text-white shadow-[0_0_10px_rgba(217,70,239,0.6)]">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ duration: 0.2 }}
            className="absolute right-0 z-50 mt-3 w-[min(90vw,380px)] overflow-hidden rounded-2xl border border-white/15 bg-[#0b0d17] shadow-[0_24px_60px_-12px_rgba(0,0,0,0.8)]"
          >
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <span className="text-sm font-black uppercase tracking-wider text-white">New Media</span>
              <div className="flex items-center gap-2">
                {count > 0 && (
                  <button onClick={markAllRead} className="rounded-lg px-2 py-1 text-[11px] font-bold uppercase tracking-wider text-fuchsia-300 transition-colors hover:bg-fuchsia-500/10">Mark all read</button>
                )}
                <button onClick={() => setOpen(false)} className="rounded-lg p-1 text-zinc-500 transition-colors hover:text-white"><X className="h-4 w-4" /></button>
              </div>
            </div>
            <div className="max-h-[60vh] overflow-y-auto p-2">
              {count === 0 ? (
                <div className="px-4 py-8 text-center">
                  <Bell className="mx-auto mb-3 h-8 w-8 text-zinc-600" />
                  <p className="text-sm font-bold text-zinc-400">No new media</p>
                  <p className="mt-1 text-xs text-zinc-600">New posts from WG channels will appear here.</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {newItems.map((item) => {
                    const meta = META[item.platform];
                    const Icon = meta.icon;
                    return (
                      <a key={item.id} href={item.originalMediaUrl ?? undefined} target="_blank" rel="noopener noreferrer" onClick={() => onOpenItem(item.platform)}
                        className="flex items-start gap-3 rounded-xl p-2.5 transition-colors hover:bg-white/[0.04]">
                        <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-zinc-900">
                          {item.thumbnailUrl ? (
                            <img src={item.thumbnailUrl} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center"><Icon className="h-5 w-5 text-zinc-700" /></div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="line-clamp-2 text-xs font-bold text-white">{item.title}</p>
                          <div className="mt-1 flex items-center gap-2">
                            <span className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider ${meta.chip}`}>
                              <Icon className="h-2.5 w-2.5" /> {meta.label}
                            </span>
                            <span className="text-[10px] text-zinc-500">{timeAgo(item.publishedAt)}</span>
                          </div>
                        </div>
                        <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-fuchsia-400 shadow-[0_0_8px_rgba(217,70,239,0.8)]" />
                      </a>
                    );
                  })}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function MediaHubPage() {
  const [platform, setPlatform] = useState<PlatformFilter>("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"latest" | "oldest">("latest");

  const { data, error, isLoading, isFetching, refetch } = useQuery<HubResponse>({
    queryKey: ["media-hub"],
    queryFn: async () => {
      const res = await fetch(apiUrl("/api/media-hub"), { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load the media hub.");
      return res.json();
    },
    staleTime: 5_000,
  });

  const channels = data?.channels ?? EMPTY_CHANNELS;
  const configured = data?.configured ?? ({} as Record<Platform, boolean>);
  const items = data?.items ?? [];
  const [lastSeen, setLastSeenState] = useState<string>(getLastSeen);

  const perPlatform = useMemo(() => {
    const lower = query.trim().toLowerCase();
    return PLATFORMS.map((p) => {
      let list = items.filter((item) => item.platform === p);
      if (lower) {
        list = list.filter((item) =>
          [item.title, item.caption ?? "", item.author ?? "", item.channelName ?? ""]
            .join(" ")
            .toLowerCase()
            .includes(lower)
        );
      }
      return [...list].sort((a, b) => {
        const ta = a.publishedAt ?? "";
        const tb = b.publishedAt ?? "";
        return sort === "oldest" ? ta.localeCompare(tb) : tb.localeCompare(ta);
      });
    });
  }, [items, query, sort]);

  const byPlatform = useMemo(() => {
    const map = {} as Record<Platform, MediaHubItem[]>;
    perPlatform.forEach((list, i) => (map[PLATFORMS[i]] = list));
    return map;
  }, [perPlatform]);

  const anyContent = items.length > 0;
  const totalShown = perPlatform.reduce((sum, list) => sum + list.length, 0);
  const nothingMatches = totalShown === 0 && anyContent;

  return (
    <div className="flex-1 bg-[#04060f] text-white">
      <div className="mx-auto max-w-7xl px-6 py-8">
        <div className="wg-hero px-6 py-9 mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <span className="wg-eyebrow inline-flex items-center gap-2"><Clapperboard className="h-4 w-4" /> Watch · Follow · Share</span>
            <h1 className="wg-hero-title text-4xl mt-4 sm:text-5xl">
              Media <span className="bg-gradient-to-r from-fuchsia-300 to-pink-400 bg-clip-text text-transparent">Hub</span>
            </h1>
            <p className="mt-3 max-w-xl text-sm text-zinc-400 leading-relaxed">
              Watch, follow and experience WG everywhere. All content is pulled live from
              Waryaa Gaming's official channels — one tap opens the original post.
            </p>
          </div>
          <div className="shrink-0 pt-1">
            <MediaNotificationBell
              items={items}
              onOpenItem={(p) => {
                setPlatform(p);
                const newest = items
                  .filter((i) => i.platform === p)
                  .map((i) => i.publishedAt)
                  .filter(Boolean)
                  .sort((a, b) => String(b).localeCompare(String(a)))[0];
                if (newest) { setLastSeen(newest); setLastSeenState(newest); }
              }}
            />
          </div>
        </div>

        <FadeUp delay={0.05} className="mb-6">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-zinc-500">Showcase ·</span>
            {FILTERS.map((f) => {
              const active = platform === f.value;
              return (
                <button
                  key={f.value}
                  onClick={() => setPlatform(f.value)}
                  className={`wg-chip transition-all duration-200 ${active ? "wg-chip-solid" : "border-white/15 text-zinc-400 hover:text-white hover:border-white/30"}`}
                >
                  {f.label}
                </button>
              );
            })}
          </div>
        </FadeUp>
<FadeUp delay={0.08} className="mt-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full sm:max-w-xs">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search media…"
                className="w-full rounded-xl border border-white/10 bg-white/[0.03] py-2.5 pl-9 pr-3 text-sm text-white placeholder-zinc-600 outline-none transition-colors focus:border-fuchsia-400/60"
              />
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSort(sort === "latest" ? "oldest" : "latest")}
                className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-zinc-300 transition-colors hover:border-white/25 hover:text-white"
              >
                {sort === "latest" ? "Latest First" : "Oldest First"}
              </button>
              <button
                onClick={() => refetch()}
                disabled={isFetching}
                className="wg-btn-pill inline-flex items-center gap-2 px-3 py-2 text-[11px] font-bold uppercase tracking-wider disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
                Refresh
              </button>
            </div>
          </div>
        </FadeUp>

        {!isLoading && !error && platform === "all" && (
          <LatestSpotlight items={items} channels={channels} lastSeen={lastSeen} />
        )}

        {isLoading ? (
          <LoadingSections />
        ) : error ? (
          <ErrorState onRetry={() => refetch()} />
        ) : nothingMatches ? (
          <EmptyState onClear={() => setQuery("")} />
        ) : (
          <div className="mt-10 space-y-14">
            {platform === "all" ? (
              PLATFORMS.map((p) => (
                <Section
                  key={p}
                  platform={p}
                  items={byPlatform[p]}
                  configured={!!configured[p]}
                  channelUrl={channels[p]}
                  onViewAll={() => setPlatform(p)}
                  lastSeen={lastSeen}
                />
              ))
            ) : (
              <Section
                platform={platform}
                items={byPlatform[platform]}
                configured={!!configured[platform]}
                channelUrl={channels[platform]}
                lastSeen={lastSeen}
              />
            )}
          </div>
        )}

        {!isLoading && !error && <ChannelButtons channels={channels} />}
      </div>
    </div>
  );
}
// ── Section (one platform) ────────────────────────────────────────────────────
function Section({
  platform,
  items,
  configured,
  channelUrl,
  onViewAll,
  lastSeen,
}: {
  platform: Platform;
  items: MediaHubItem[];
  configured: boolean;
  channelUrl?: string;
  onViewAll?: () => void;
  lastSeen: string;
}) {
  const meta = META[platform];
  const Icon = meta.icon;

  return (
    <section>
      <FadeUp>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
          <h2 className="flex items-center gap-2.5 text-lg font-black uppercase tracking-tight">
            <Icon className={`h-5 w-5 ${meta.text}`} />
            Latest from{" "}
            <span className={meta.text}>{meta.label}</span>
          </h2>
          {onViewAll && items.length > 0 && (
            <button
              onClick={onViewAll}
              className="group inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-fuchsia-300 transition-colors hover:text-fuchsia-200"
            >
              View all
              <span className="transition-transform group-hover:translate-x-0.5">→</span>
            </button>
          )}
        </div>
      </FadeUp>

      {items.length === 0 ? (
        <PlatformEmpty platform={platform} configured={configured} channelUrl={channelUrl} />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {items.map((item, i) => (
            <MediaCard key={item.id} item={item} delay={Math.min(i, 4) * 0.06} isNew={checkIsNew(item, lastSeen)} />
          ))}
        </div>
      )}
    </section>
  );
}

// ── Loading / Error / Empty states ────────────────────────────────────────────
function LoadingSections() {
  return (
    <div className="mt-10 space-y-12">
      {PLATFORMS.slice(0, 3).map((p) => (
        <div key={p}>
          <Skeleton className="mb-4 h-6 w-48" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-56 rounded-2xl" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <FadeUp className="mt-10">
      <div className="rounded-2xl border border-red-500/25 bg-red-500/5 px-6 py-14 text-center">
        <Clapperboard className="mx-auto mb-4 h-10 w-10 text-red-400/70" />
        <p className="font-bold text-white">We couldn't load the media hub.</p>
        <p className="mt-1 text-sm text-zinc-500">
          The social feed is temporarily unavailable. Try again in a moment.
        </p>
        <button
          onClick={onRetry}
          className="mt-5 inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/[0.04] px-4 py-2 text-xs font-bold uppercase tracking-wider text-white hover:bg-white/[0.08]"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Retry
        </button>
      </div>
    </FadeUp>
  );
}

function EmptyState({ onClear }: { onClear: () => void }) {
  return (
    <FadeUp className="mt-10">
      <div className="rounded-2xl border border-white/10 bg-white/[0.02] px-6 py-14 text-center">
        <Sparkles className="mx-auto mb-4 h-10 w-10 text-sky-400/60" />
        <p className="font-bold text-white">No media matches your search.</p>
        <p className="mt-1 text-sm text-zinc-500">Try a different keyword or clear the search.</p>
        <button
          onClick={onClear}
          className="mt-5 rounded-xl border border-sky-400/40 bg-sky-400/10 px-4 py-2 text-xs font-bold uppercase tracking-wider text-sky-300 hover:bg-sky-400/20"
        >
          Clear search
        </button>
      </div>
    </FadeUp>
  );
}

// ── WG Everywhere — channel buttons ───────────────────────────────────────────
const CHANNEL_BUTTONS: { platform: Platform; label: string }[] = [
  { platform: "youtube", label: "YouTube Channel" },
  { platform: "tiktok", label: "TikTok Channel" },
  { platform: "instagram", label: "Instagram Profile" },
  { platform: "facebook", label: "Facebook Page" },
];

function ChannelButtons({ channels }: { channels: Record<Platform, string> }) {
  return (
    <FadeUp className="mt-16">
      <div className="wg-card rounded-3xl border border-fuchsia-400/25 bg-gradient-to-br from-fuchsia-500/[0.08] to-purple-700/[0.08] p-8 text-center sm:p-10">
        <h2 className="text-2xl font-black uppercase tracking-tight sm:text-3xl">
          WG Everywhere.{" "}
          <span className="bg-gradient-to-r from-fuchsia-300 to-pink-300 bg-clip-text text-transparent">
            One Community.
          </span>
        </h2>
        <p className="mx-auto mt-3 max-w-lg text-sm text-zinc-400">
          Follow Waryaa Gaming on every platform and never miss a post, stream, goal or
          upload.
        </p>
        <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {CHANNEL_BUTTONS.map((btn) => {
            const meta = META[btn.platform];
            const Icon = meta.icon;
            const href = channels[btn.platform];
            if (!href) return null;
            return (
              <a
                key={btn.platform}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="wg-sheen group inline-flex items-center justify-center gap-2.5 rounded-xl border border-white/15 bg-white/[0.04] px-4 py-3.5 text-xs font-black uppercase tracking-wider transition-all duration-300 hover:-translate-y-0.5 hover:border-fuchsia-400/40 hover:bg-white/[0.07]"
              >
                <Icon className={`h-4 w-4 ${meta.text}`} />
                {btn.label}
              </a>
            );
          })}
        </div>
      </div>
    </FadeUp>
  );
}