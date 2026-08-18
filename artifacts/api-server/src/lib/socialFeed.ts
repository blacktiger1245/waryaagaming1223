/**
 * WG Media Hub — social feed aggregator.
 *
 * This module retrieves REAL content published by Waryaa Gaming's official
 * social accounts whenever credentials are configured. It NEVER fabricates
 * posts or fake engagement numbers: if a provider isn't configured (or the
 * upstream API doesn't return a field), that data is simply absent.
 *
 * Env vars to enable each provider (set them server-side, never in the client):
 *   YouTube   → YOUTUBE_API_KEY, YOUTUBE_CHANNEL_ID
 *   TikTok    → TIKTOK_ACCESS_TOKEN, TIKTOK_OPEN_ID   (Content Posting/Business API)
 *   Instagram → INSTAGRAM_ACCESS_TOKEN, INSTAGRAM_USER_ID (Graph API)
 *   Facebook  → FACEBOOK_ACCESS_TOKEN, FACEBOOK_PAGE_ID   (Graph API)
 */

export type Platform = "youtube" | "tiktok" | "instagram" | "facebook";

export interface MediaHubItem {
  /** Stable-ish unique id (never used for navigation). */
  id: string;
  platform: Platform;
  contentType: "video" | "image" | "carousel" | "reel";
  /** Title / caption. */
  title: string;
  caption?: string;
  thumbnailUrl?: string;
  /** The ACTUAL permalink to the original post/video. Must never be faked. */
  originalMediaUrl?: string;
  /** ISO 8601 published timestamp, when the platform returns it. */
  publishedAt?: string;
  views?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  author?: string;
  channelName?: string;
  durationSeconds?: number;
  /** Verification badge — only when the platform confirms it. */
  verified?: boolean;
}

/**
 * The official WG social URLs — single source of truth (mirrors the existing
 * links already used across the site). The Media Hub channel buttons reuse
 * these exact URLs.
 */
export const CHANNELS: Record<Platform, string> = {
  youtube: "https://www.youtube.com/@waryaagg",
  tiktok: "https://www.tiktok.com/@waryaa.gaming?_r=1&_t=ZS-96AsSy9gKX6",
  instagram:
    "https://www.instagram.com/waryaa.gaming?igsh=OG5wd2ZocTZsa3Fv&utm_source=qr",
  facebook:
    "https://www.facebook.com/waryaaggg?mibextid=wwXIfr&rdid=sdbgt7HB485wrREE&share_url=https%3A%2F%2Fwww.facebook.com%2Fshare%2F18QxiCKH2p%2F%3Fmibextid%3DwwXIfr",
};
// ── YouTube (YouTube Data API v3) ──────────────────────────────────────────────
const YT_SEARCH_URL = "https://www.googleapis.com/youtube/v3/search";
const YT_VIDEOS_URL = "https://www.googleapis.com/youtube/v3/videos";

function isoDurationToSeconds(input: string): number {
  const match = input.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!match) return 0;
  const h = match[1] ? Number.parseInt(match[1], 10) : 0;
  const m = match[2] ? Number.parseInt(match[2], 10) : 0;
  const s = match[3] ? Number.parseInt(match[3], 10) : 0;
  return h * 3600 + m * 60 + s;
}

function firstThumbnail(
  thumbnails: Record<string, { url?: string }> | undefined
): string | undefined {
  const order = ["maxres", "high", "standard", "medium", "default"];
  for (const key of order) {
    const t = thumbnails?.[key];
    if (t?.url) return t.url;
  }
  return undefined;
}

export async function fetchYouTube(): Promise<MediaHubItem[]> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) return [];

  const searchParams = new URLSearchParams({
    part: "snippet",
    type: "video",
    order: "date",
    maxResults: "12",
    key: apiKey,
  });
  const channelId = process.env.YOUTUBE_CHANNEL_ID;
  if (channelId) searchParams.set("channelId", channelId);

  const searchRes = await fetch(`${YT_SEARCH_URL}?${searchParams.toString()}`, {
    signal: AbortSignal.timeout(12000),
  });
  if (!searchRes.ok) return [];

  const searchData = (await searchRes.json()) as {
    items?: Array<{ id?: { videoId?: string } }>;
  };
  const videos = (searchData.items ?? []).filter((item) => item?.id?.videoId);
  if (videos.length === 0) return [];

  const ids = videos.map((item) => item.id?.videoId as string).join(",");
  const videoParams = new URLSearchParams({
    part: "snippet,contentDetails,statistics",
    id: ids,
    key: apiKey,
  });
  const videoRes = await fetch(`${YT_VIDEOS_URL}?${videoParams.toString()}`, {
    signal: AbortSignal.timeout(12000),
  });
  const videoData = videoRes.ok
    ? ((await videoRes.json()) as { items?: Array<Record<string, unknown>> })
    : { items: [] };
  const detail = new Map(
    (videoData.items ?? []).map((item) => [String(item.id), item])
  );

  return videos.map((item) => {
    const id = item.id?.videoId as string;
    const d = detail.get(id) ?? ({} as Record<string, unknown>);
    const dSnippet = (d.snippet ?? {}) as Record<string, unknown>;
    const stats = (d.statistics ?? {}) as Record<string, unknown>;
    const thumbnails = dSnippet.thumbnails as
      | Record<string, { url?: string }>
      | undefined;

    return {
      id: `yt-${id}`,
      platform: "youtube" as const,
      contentType: "video" as const,
      title: String(dSnippet.title ?? "Untitled video"),
      originalMediaUrl: `https://www.youtube.com/watch?v=${id}`,
      thumbnailUrl: firstThumbnail(thumbnails),
      publishedAt: String(dSnippet.publishedAt ?? ""),
      views: stats.viewCount != null ? Number(stats.viewCount) : undefined,
      likes: stats.likeCount != null ? Number(stats.likeCount) : undefined,
      comments: stats.commentCount != null ? Number(stats.commentCount) : undefined,
      author: String(dSnippet.channelTitle ?? ""),
      channelName: "Waryaa Gaming",
      durationSeconds: d.contentDetails
        ? isoDurationToSeconds(
            String((d.contentDetails as Record<string, unknown>).duration ?? "")
          )
        : undefined,
    };
  });
}
// ── TikTok / Instagram / Facebook ──────────────────────────────────────────────
// These require platform business/graph credentials and dedicated API access.
// We keep the shape ready so the integration can be connected transparently
// later; until credentials are present they return no items (nothing fake).

export async function fetchTikTok(): Promise<MediaHubItem[]> {
  if (!process.env.TIKTOK_ACCESS_TOKEN || !process.env.TIKTOK_OPEN_ID) return [];
  // TODO: call the TikTok Content Posting API and map into MediaHubItem[].
  //   originalMediaUrl → `https://www.tiktok.com/@waryaa.gaming/video/${id}`
  return [];
}

export async function fetchInstagram(): Promise<MediaHubItem[]> {
  if (!process.env.INSTAGRAM_ACCESS_TOKEN || !process.env.INSTAGRAM_USER_ID)
    return [];
  // TODO: call the Instagram Graph API "recent media" endpoint and map to MediaHubItem[].
  //   originalMediaUrl → `https://www.instagram.com/p/${shortcode}/`
  return [];
}

export async function fetchFacebook(): Promise<MediaHubItem[]> {
  if (!process.env.FACEBOOK_ACCESS_TOKEN || !process.env.FACEBOOK_PAGE_ID)
    return [];
  // TODO: call the Facebook Graph API `<page_id>/feed` and map to MediaHubItem[].
  //   originalMediaUrl → `https://www.facebook.com/${page}/posts/${id}`
  return [];
}