import type { IconType } from "react-icons";
import {
  FaFacebookF,
  FaInstagram,
  FaTiktok,
  FaWhatsapp,
  FaXTwitter,
  FaYoutube,
} from "react-icons/fa6";

/**
 * Social platforms a player may attach to their profile. Shared by the Edit
 * Profile form and the public player profile so the fields, labels, icons and
 * placeholders always match the API allowlist (lib/social-links.ts on the
 * server normalises the stored value into a canonical https URL).
 */
export type SocialField =
  | "tiktokUrl"
  | "facebookUrl"
  | "whatsappUrl"
  | "instagramUrl"
  | "youtubeUrl"
  | "twitterUrl";

export interface SocialLinkDef {
  field: SocialField;
  label: string;
  icon: IconType;
  /** Hint shown inside the editor input. */
  placeholder: string;
  /** Brand colour used for the icon. */
  color: string;
}

export const SOCIAL_LINKS: readonly SocialLinkDef[] = [
  {
    field: "tiktokUrl",
    label: "TikTok",
    icon: FaTiktok,
    placeholder: "@username  (or paste your TikTok link)",
    color: "#25F4EE",
  },
  {
    field: "instagramUrl",
    label: "Instagram",
    icon: FaInstagram,
    placeholder: "@username  (or paste your Instagram link)",
    color: "#E1306C",
  },
  {
    field: "twitterUrl",
    label: "X (Twitter)",
    icon: FaXTwitter,
    placeholder: "@username  (or paste your X link)",
    color: "#e7e9ea",
  },
  {
    field: "facebookUrl",
    label: "Facebook",
    icon: FaFacebookF,
    placeholder: "username  (or paste your Facebook link)",
    color: "#1877F2",
  },
  {
    field: "youtubeUrl",
    label: "YouTube",
    icon: FaYoutube,
    placeholder: "@channel  (or paste your channel link)",
    color: "#FF0000",
  },
  {
    field: "whatsappUrl",
    label: "WhatsApp",
    icon: FaWhatsapp,
    placeholder: "Phone with country code, e.g. 252611234567",
    color: "#25D366",
  },
];

/** The empty editor state for every platform. */
export function emptySocialValues(): Record<SocialField, string> {
  return {
    tiktokUrl: "",
    facebookUrl: "",
    whatsappUrl: "",
    instagramUrl: "",
    youtubeUrl: "",
    twitterUrl: "",
  };
}

/** Short display label for a stored social URL, e.g. "@ahmed" or "252611234567". */
export function socialLinkLabel(url: string): string {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");
    if (host === "wa.me" || host.includes("whatsapp")) return parsed.pathname.replace(/^\//, "");
    const segment = parsed.pathname.replace(/\/+$/, "").split("/").filter(Boolean).pop();
    return segment ? segment : host;
  } catch {
    return url;
  }
}
