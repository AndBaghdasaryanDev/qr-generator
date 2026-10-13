import { parseWebUrl } from "@/lib/validation/url";

export interface SocialPlatform {
  id: string;
  label: string;
  hosts: readonly string[];
  /** Builds a profile URL from a username; null when only full URLs are accepted. */
  profileUrl: ((username: string) => string) | null;
  usernamePattern: RegExp | null;
  usernameHint: string;
}

export const SOCIAL_PLATFORMS = [
  {
    id: "instagram",
    label: "Instagram",
    hosts: ["instagram.com"],
    profileUrl: (u) => `https://www.instagram.com/${u}/`,
    usernamePattern: /^[A-Za-z0-9._]{1,30}$/,
    usernameHint: "Up to 30 letters, numbers, periods and underscores.",
  },
  {
    id: "tiktok",
    label: "TikTok",
    hosts: ["tiktok.com"],
    profileUrl: (u) => `https://www.tiktok.com/@${u}`,
    usernamePattern: /^[A-Za-z0-9._]{2,24}$/,
    usernameHint: "2–24 letters, numbers, periods and underscores.",
  },
  {
    id: "facebook",
    label: "Facebook",
    hosts: ["facebook.com", "fb.com"],
    profileUrl: (u) => `https://www.facebook.com/${u}`,
    usernamePattern: /^[A-Za-z0-9.]{5,50}$/,
    usernameHint: "At least 5 letters, numbers or periods.",
  },
  {
    id: "linkedin",
    label: "LinkedIn",
    hosts: ["linkedin.com"],
    profileUrl: (u) => `https://www.linkedin.com/in/${u}/`,
    usernamePattern: /^[A-Za-z0-9-]{3,100}$/,
    usernameHint: "The part after linkedin.com/in/.",
  },
  {
    id: "x",
    label: "X (Twitter)",
    hosts: ["x.com", "twitter.com"],
    profileUrl: (u) => `https://x.com/${u}`,
    usernamePattern: /^[A-Za-z0-9_]{1,15}$/,
    usernameHint: "Up to 15 letters, numbers and underscores.",
  },
  {
    id: "youtube",
    label: "YouTube channel",
    hosts: ["youtube.com"],
    profileUrl: (u) => `https://www.youtube.com/@${u}`,
    usernamePattern: /^[A-Za-z0-9._-]{3,30}$/,
    usernameHint: "Your @handle, without the @.",
  },
  {
    id: "threads",
    label: "Threads",
    hosts: ["threads.com", "threads.net"],
    profileUrl: (u) => `https://www.threads.com/@${u}`,
    usernamePattern: /^[A-Za-z0-9._]{1,30}$/,
    usernameHint: "Same as your Instagram username.",
  },
  {
    id: "github",
    label: "GitHub",
    hosts: ["github.com"],
    profileUrl: (u) => `https://github.com/${u}`,
    usernamePattern: /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/,
    usernameHint: "Up to 39 letters, numbers and hyphens.",
  },
  {
    id: "telegram",
    label: "Telegram",
    hosts: ["t.me", "telegram.me"],
    profileUrl: (u) => `https://t.me/${u}`,
    usernamePattern: /^[A-Za-z0-9_]{5,32}$/,
    usernameHint: "5–32 letters, numbers and underscores.",
  },
  {
    id: "snapchat",
    label: "Snapchat",
    hosts: ["snapchat.com"],
    profileUrl: (u) => `https://www.snapchat.com/add/${u}`,
    usernamePattern: /^[A-Za-z0-9._-]{3,15}$/,
    usernameHint: "3–15 characters.",
  },
  {
    id: "pinterest",
    label: "Pinterest",
    hosts: ["pinterest.com"],
    profileUrl: (u) => `https://www.pinterest.com/${u}/`,
    usernamePattern: /^[A-Za-z0-9_]{3,30}$/,
    usernameHint: "3–30 letters, numbers and underscores.",
  },
  {
    id: "other",
    label: "Other network",
    hosts: [],
    profileUrl: null,
    usernamePattern: null,
    usernameHint: "Paste the full profile link.",
  },
] as const satisfies readonly SocialPlatform[];

export type SocialPlatformId = (typeof SOCIAL_PLATFORMS)[number]["id"];

export const SOCIAL_PLATFORM_IDS = SOCIAL_PLATFORMS.map((p) => p.id) as [SocialPlatformId, ...SocialPlatformId[]];

export function getSocialPlatform(id: SocialPlatformId): SocialPlatform {
  return SOCIAL_PLATFORMS.find((p) => p.id === id) ?? SOCIAL_PLATFORMS[SOCIAL_PLATFORMS.length - 1];
}

const matchesHost = (hostname: string, hosts: readonly string[]) =>
  hosts.some((h) => hostname === h || hostname.endsWith(`.${h}`));

export type SocialResult = { ok: true; url: string } | { ok: false; error: string };

/** Accepts either a profile URL or a bare username (with or without a leading @). */
export function resolveSocialProfile(platformId: SocialPlatformId, input: string): SocialResult {
  const platform = getSocialPlatform(platformId);
  const value = input.trim();
  if (!value) return { ok: false, error: "Enter a username or profile link." };

  const looksLikeUrl = /^https?:\/\//i.test(value) || value.includes("/") || platform.profileUrl === null;
  if (looksLikeUrl) {
    const parsed = parseWebUrl(value);
    if (!parsed.ok) return parsed;
    if (platform.hosts.length > 0 && !matchesHost(parsed.url.hostname.toLowerCase(), platform.hosts)) {
      return { ok: false, error: `This isn't a ${platform.label} link.` };
    }
    return { ok: true, url: parsed.href };
  }

  const username = value.replace(/^@/, "");
  if (platform.usernamePattern && !platform.usernamePattern.test(username)) {
    return { ok: false, error: `That doesn't look like a ${platform.label} username. ${platform.usernameHint}` };
  }
  return { ok: true, url: platform.profileUrl ? platform.profileUrl(username) : value };
}
