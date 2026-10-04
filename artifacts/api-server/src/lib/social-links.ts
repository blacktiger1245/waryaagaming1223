/**
 * Player social links — the single source of truth for which platforms a player
 * may attach to their profile and how a raw value becomes a canonical URL.
 *
 * A player may paste a full link (`https://…)` or just their handle / username /
 * phone number; both are accepted here so the database only ever stores a clean,
 * safe `https://` URL. Anything that is not a real URL for that platform is
 * rejected instead of being saved verbatim.
 */

export type SocialField =
  | "tiktokUrl"
  | "facebookUrl"
  | "whatsappUrl"
  | "instagramUrl"
  | "youtubeUrl"
  | "twitterUrl";

export interface SocialPlatform {
  /** camelCase column key on the players row and in the API payload. */
  field: SocialField;
  /** Human label, e.g. "TikTok". */
  label: string;
  /** Prefix a bare handle/username is appended to. */
  base: string;
  /** How a bare (non-URL) value is interpreted. */
  kind: "handle" | "phone";
  /** Allowed characters for a bare handle (unused for phone numbers). */
  pattern?: RegExp;
}

/** Hosts a pasted full URL is allowed to point at (root domain + subdomains). */
const ALLOWED_HOSTS: Record<SocialField, readonly string[]> = {
  tiktokUrl: ["tiktok.com"],
  facebookUrl: ["facebook.com", "fb.com"],
  whatsappUrl: ["wa.me", "whatsapp.com"],
  instagramUrl: ["instagram.com"],
  youtubeUrl: ["youtube.com", "youtu.be"],
  twitterUrl: ["twitter.com", "x.com"],
};

export const SOCIAL_PLATFORMS: readonly SocialPlatform[] = [
  { field: "tiktokUrl", label: "TikTok", base: "https://www.tiktok.com/@", kind: "handle", pattern: /^[A-Za-z0-9._]{2,30}$/ },
  { field: "instagramUrl", label: "Instagram", base: "https://www.instagram.com/", kind: "handle", pattern: /^[A-Za-z0-9._]{1,30}$/ },
  { field: "twitterUrl", label: "X (Twitter)", base: "https://x.com/", kind: "handle", pattern: /^[A-Za-z0-9_]{1,15}$/ },
  { field: "facebookUrl", label: "Facebook", base: "https://www.facebook.com/", kind: "handle", pattern: /^[A-Za-z0-9.]{5,50}$/ },
  { field: "youtubeUrl", label: "YouTube", base: "https://www.youtube.com/@", kind: "handle", pattern: /^[A-Za-z0-9._-]{1,60}$/ },
  { field: "whatsappUrl", label: "WhatsApp", base: "https://wa.me/", kind: "phone" },
];

/** Longest URL we will store (well under a text column, guards junk input). */
const MAX_URL_LENGTH = 200;

export type NormalizeSocialResult =
  | { ok: true; value: string | null }
  | { ok: false; error: string };

function isAllowedHost(field: SocialField, hostname: string): boolean {
  const host = hostname.toLowerCase();
  return (ALLOWED_HOSTS[field] ?? []).some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
}

/**
 * Turn a raw form value into a canonical https URL (or `null` when cleared).
 * Returns an error message the API can surface to the player.
 */
export function normalizeSocialLink(platform: SocialPlatform, raw: unknown): NormalizeSocialResult {
  if (raw === null || raw === undefined) return { ok: true, value: null };
  if (typeof raw !== "string") return { ok: false, error: `${platform.label} link must be text` };

  const trimmed = raw.trim();
  if (trimmed === "") return { ok: true, value: null };

  // A pasted link: keep it only if it really is a URL for this platform.
  if (/^https?:\/\//i.test(trimmed)) {
    let url: URL;
    try {
      url = new URL(trimmed);
    } catch {
      return { ok: false, error: `That ${platform.label} link is not a valid URL` };
    }
    if (!isAllowedHost(platform.field, url.hostname)) {
      return { ok: false, error: `That link is not a ${platform.label} address` };
    }
    const path = url.pathname.replace(/\/+$/, "");
    const value = `https://${url.hostname}${path}${url.search}`;
    if (value.length > MAX_URL_LENGTH) {
      return { ok: false, error: `That ${platform.label} link is too long` };
    }
    return { ok: true, value };
  }

  if (platform.kind === "phone") {
    const digits = trimmed.replace(/[^\d]/g, "");
    if (digits.length < 8 || digits.length > 15) {
      return { ok: false, error: "Enter the WhatsApp number with its country code (8–15 digits)" };
    }
    return { ok: true, value: `https://wa.me/${digits}` };
  }

  const handle = trimmed.replace(/^@+/, "");
  if (!platform.pattern || !platform.pattern.test(handle)) {
    return { ok: false, error: `Enter a valid ${platform.label} username` };
  }
  const value = `${platform.base}${handle}`;
  if (value.length > MAX_URL_LENGTH) {
    return { ok: false, error: `That ${platform.label} username is too long` };
  }
  return { ok: true, value };
}
