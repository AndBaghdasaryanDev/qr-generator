import { parseWebUrl } from "@/lib/validation/url";

export type VideoKind =
  | "youtube"
  | "vimeo"
  | "tiktok"
  | "instagram"
  | "facebook"
  | "twitch"
  | "dailymotion"
  | "loom"
  | "direct"
  | "page";

export type DirectVideoFormat = "mp4" | "webm" | "ogg" | "mov" | "m4v" | "hls";

export interface VideoInfo {
  kind: VideoKind;
  /** Human-readable destination type, e.g. "YouTube Short". */
  label: string;
  /** URL that goes into the QR code (cleaned up where safe, otherwise the input as-is). */
  url: string;
  videoId: string | null;
  thumbnailUrl: string | null;
  format: DirectVideoFormat | null;
  /** True when the destination can be played by an HTML <video> element. */
  playableInBrowser: boolean;
  notes: string[];
}

export type VideoParseResult = { ok: true; info: VideoInfo } | { ok: false; error: string };

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
]);

const DIRECT_EXTENSIONS: Record<string, DirectVideoFormat> = {
  mp4: "mp4",
  webm: "webm",
  ogv: "ogg",
  ogg: "ogg",
  mov: "mov",
  m4v: "m4v",
  m3u8: "hls",
};

const hostIs = (host: string, domain: string) => host === domain || host.endsWith(`.${domain}`);

function base(kind: VideoKind, label: string, url: string): VideoInfo {
  return { kind, label, url, videoId: null, thumbnailUrl: null, format: null, playableInBrowser: false, notes: [] };
}

/** Keeps a YouTube start time in a normalized `t=` form (seconds or 1h2m3s). */
function youtubeStart(params: URLSearchParams): string | null {
  const t = params.get("t") ?? params.get("start");
  if (!t) return null;
  return /^\d+s?$|^(\d+h)?(\d+m)?(\d+s)?$/.test(t) ? t : null;
}

function classifyYoutube(url: URL): VideoInfo | null {
  const host = url.hostname.toLowerCase();
  const segments = url.pathname.split("/").filter(Boolean);
  let id: string | null = null;
  let isShort = false;
  let isLive = false;

  if (host === "youtu.be") {
    id = segments[0] ?? null;
  } else if (YOUTUBE_HOSTS.has(host)) {
    if (segments[0] === "watch") id = url.searchParams.get("v");
    else if (segments[0] === "shorts") {
      id = segments[1] ?? null;
      isShort = true;
    } else if (segments[0] === "live") {
      id = segments[1] ?? null;
      isLive = true;
    } else if (segments[0] === "embed" || segments[0] === "v" || segments[0] === "e") id = segments[1] ?? null;
    else if (segments[0] === "playlist" && url.searchParams.get("list")) {
      const info = base("youtube", "YouTube playlist", `https://www.youtube.com/playlist?list=${encodeURIComponent(url.searchParams.get("list") ?? "")}`);
      info.notes.push("Opens the playlist in the YouTube app or website.");
      return info;
    } else {
      const info = base("page", "YouTube page", url.href);
      info.notes.push("This looks like a YouTube channel or page, not a single video. The QR code will open it as-is.");
      return info;
    }
  } else {
    return null;
  }

  if (!id || !YOUTUBE_ID.test(id)) {
    return null;
  }

  const start = youtubeStart(url.searchParams);
  let canonical: string;
  if (isShort) {
    canonical = `https://www.youtube.com/shorts/${id}`;
  } else {
    // youtu.be links are the shortest form, which keeps the QR code less dense.
    const query = new URLSearchParams();
    if (start) query.set("t", start);
    const list = url.searchParams.get("list");
    if (list && /^[A-Za-z0-9_-]+$/.test(list)) query.set("list", list);
    const qs = query.toString();
    canonical = `https://youtu.be/${id}${qs ? `?${qs}` : ""}`;
  }

  const info = base("youtube", isShort ? "YouTube Short" : isLive ? "YouTube live stream" : "YouTube video", canonical);
  info.videoId = id;
  info.thumbnailUrl = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
  info.notes.push("Phones with the YouTube app usually open it there; others open youtube.com.");
  if (canonical !== url.href) info.notes.push("Tracking parameters were removed and the link was shortened.");
  return info;
}

function classifyPlatform(url: URL): VideoInfo | null {
  const host = url.hostname.toLowerCase();
  const segments = url.pathname.split("/").filter(Boolean);

  if (hostIs(host, "vimeo.com")) {
    if (host === "player.vimeo.com" && segments[0] === "video" && /^\d+$/.test(segments[1] ?? "")) {
      const info = base("vimeo", "Vimeo video", `https://vimeo.com/${segments[1]}`);
      info.videoId = segments[1] ?? null;
      return info;
    }
    const numeric = segments.find((s) => /^\d{6,}$/.test(s));
    if (numeric) {
      const info = base("vimeo", "Vimeo video", url.href);
      info.videoId = numeric;
      return info;
    }
    return null;
  }
  if (hostIs(host, "tiktok.com")) {
    const videoIndex = segments.indexOf("video");
    if (videoIndex > 0 && /^\d+$/.test(segments[videoIndex + 1] ?? "")) {
      const info = base("tiktok", "TikTok video", `https://www.tiktok.com/${segments.slice(0, videoIndex + 2).join("/")}`);
      info.videoId = segments[videoIndex + 1] ?? null;
      return info;
    }
    if (host === "vm.tiktok.com" || host === "vt.tiktok.com") {
      const info = base("tiktok", "TikTok video (short link)", url.href);
      return info;
    }
    return null;
  }
  if (hostIs(host, "instagram.com")) {
    if ((segments[0] === "reel" || segments[0] === "reels" || segments[0] === "tv" || segments[0] === "p") && segments[1]) {
      return base("instagram", segments[0] === "p" ? "Instagram post" : "Instagram Reel", `https://www.instagram.com/${segments[0] === "reels" ? "reel" : segments[0]}/${segments[1]}/`);
    }
    return null;
  }
  if (host === "fb.watch") return base("facebook", "Facebook video", url.href);
  if (hostIs(host, "facebook.com")) {
    if ((segments[0] === "watch" && url.searchParams.get("v")) || segments.includes("videos") || segments[0] === "reel") {
      return base("facebook", "Facebook video", url.href);
    }
    return null;
  }
  if (hostIs(host, "twitch.tv")) {
    if (segments[0] === "videos" && /^\d+$/.test(segments[1] ?? "")) return base("twitch", "Twitch video", url.href);
    if (host === "clips.twitch.tv" || segments[1] === "clip") return base("twitch", "Twitch clip", url.href);
    if (segments.length === 1) return base("twitch", "Twitch channel (live)", url.href);
    return null;
  }
  if (hostIs(host, "dailymotion.com") && segments[0] === "video" && segments[1]) {
    return base("dailymotion", "Dailymotion video", `https://www.dailymotion.com/video/${segments[1]}`);
  }
  if (host === "dai.ly" && segments[0]) return base("dailymotion", "Dailymotion video", url.href);
  if (hostIs(host, "loom.com") && segments[0] === "share" && segments[1]) {
    return base("loom", "Loom video", url.href);
  }
  return null;
}

function classifyDirect(url: URL): VideoInfo | null {
  const ext = /\.([a-z0-9]{2,4})$/i.exec(url.pathname)?.[1]?.toLowerCase();
  const format = ext ? DIRECT_EXTENSIONS[ext] : undefined;
  if (!format) return null;

  const info = base("direct", `Direct video file (${format.toUpperCase()})`, url.href);
  info.format = format;
  info.playableInBrowser = format !== "hls";
  if (format === "hls") {
    info.notes.push("HLS streams (.m3u8) play natively in Safari/iOS; other browsers may not play them directly.");
  } else if (format === "mov") {
    info.notes.push("MOV files play in Safari but not in every Android browser. MP4 (H.264) is the most compatible.");
  } else if (format === "ogg") {
    info.notes.push("Ogg video doesn't play on iPhone. MP4 (H.264) is the most compatible.");
  } else {
    info.notes.push("Opens in the phone's built-in video player, provided the server allows browser playback.");
  }
  if (url.protocol === "http:") {
    info.notes.push("This file is served over plain http://, which some phones block. Prefer an https:// link.");
  }
  return info;
}

/** Classifies a video link without fetching it. */
export function classifyVideoUrl(input: string): VideoParseResult {
  const parsed = parseWebUrl(input);
  if (!parsed.ok) return parsed;
  const { url } = parsed;

  const youtube = classifyYoutube(url);
  if (youtube) return { ok: true, info: youtube };
  if (hostIs(url.hostname.toLowerCase(), "youtube.com") || url.hostname.toLowerCase() === "youtu.be") {
    return { ok: false, error: "This YouTube link doesn't contain a valid video ID." };
  }

  const platform = classifyPlatform(url);
  if (platform) return { ok: true, info: platform };

  const direct = classifyDirect(url);
  if (direct) return { ok: true, info: direct };

  const page = base("page", "Video page", url.href);
  page.notes.push("We can't confirm this page contains a video. The QR code will open the page exactly as entered.");
  return { ok: true, info: page };
}
