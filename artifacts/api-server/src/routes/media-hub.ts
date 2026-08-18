import { Router } from "express";
import {
  CHANNELS,
  fetchYouTube,
  fetchTikTok,
  fetchInstagram,
  fetchFacebook,
  type MediaHubItem,
  type Platform,
} from "../lib/socialFeed";

const router = Router();

interface ProviderSpec {
  platform: Platform;
  enabled: boolean;
  run: () => Promise<MediaHubItem[]>;
}

router.get("/media-hub", async (_req, res) => {
  const providers: ProviderSpec[] = [
    { platform: "youtube", enabled: !!process.env.YOUTUBE_API_KEY, run: fetchYouTube },
    { platform: "tiktok", enabled: !!process.env.TIKTOK_ACCESS_TOKEN, run: fetchTikTok },
    { platform: "instagram", enabled: !!process.env.INSTAGRAM_ACCESS_TOKEN, run: fetchInstagram },
    { platform: "facebook", enabled: !!process.env.FACEBOOK_ACCESS_TOKEN, run: fetchFacebook },
  ];

  const results = await Promise.all(
    providers.map(async (provider) => {
      try {
        const items = await provider.run();
        return { platform: provider.platform, configured: provider.enabled, items, error: null };
      } catch (err) {
        return {
          platform: provider.platform,
          configured: provider.enabled,
          items: [],
          error: err instanceof Error ? err.message : String(err),
        };
      }
    })
  );

  const items = results
    .flatMap((r) => r.items)
    .sort((a, b) => String(b.publishedAt ?? "").localeCompare(String(a.publishedAt ?? "")));

  return res.json({
    channels: CHANNELS,
    items,
    configured: Object.fromEntries(results.map((r) => [r.platform, r.configured])),
    errors: Object.fromEntries(results.filter((r) => r.error).map((r) => [r.platform, r.error])),
  });
});

export default router;