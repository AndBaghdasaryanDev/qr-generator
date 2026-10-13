import { describe, expect, it } from "vitest";
import { classifyVideoUrl, type VideoInfo } from "./classify";

function info(input: string): VideoInfo {
  const result = classifyVideoUrl(input);
  if (!result.ok) throw new Error(result.error);
  return result.info;
}

describe("YouTube", () => {
  it("normalizes watch URLs to youtu.be and strips tracking params", () => {
    const v = info("https://www.youtube.com/watch?v=dQw4w9WgXcQ&si=tracking123&feature=share");
    expect(v.kind).toBe("youtube");
    expect(v.videoId).toBe("dQw4w9WgXcQ");
    expect(v.url).toBe("https://youtu.be/dQw4w9WgXcQ");
    expect(v.thumbnailUrl).toBe("https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg");
  });
  it("preserves start time and playlist", () => {
    expect(info("https://m.youtube.com/watch?v=dQw4w9WgXcQ&t=1m30s&list=PL123abc").url).toBe(
      "https://youtu.be/dQw4w9WgXcQ?t=1m30s&list=PL123abc",
    );
    expect(info("youtu.be/dQw4w9WgXcQ?t=42").url).toBe("https://youtu.be/dQw4w9WgXcQ?t=42");
  });
  it("keeps Shorts as Shorts", () => {
    const v = info("https://youtube.com/shorts/abcdefghijk?feature=share");
    expect(v.label).toBe("YouTube Short");
    expect(v.url).toBe("https://www.youtube.com/shorts/abcdefghijk");
  });
  it("handles embed and live URLs", () => {
    expect(info("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ").url).toBe("https://youtu.be/dQw4w9WgXcQ");
    expect(info("https://www.youtube.com/live/dQw4w9WgXcQ").label).toBe("YouTube live stream");
  });
  it("rejects YouTube links without a valid video ID", () => {
    expect(classifyVideoUrl("https://www.youtube.com/watch?v=short").ok).toBe(false);
    expect(classifyVideoUrl("https://youtu.be/").ok).toBe(false);
  });
  it("treats channels as pages, not videos", () => {
    const v = info("https://www.youtube.com/@SomeChannel");
    expect(v.kind).toBe("page");
    expect(v.url).toBe("https://www.youtube.com/@SomeChannel");
  });
});

describe("other platforms", () => {
  it.each([
    ["https://vimeo.com/76979871", "vimeo"],
    ["https://player.vimeo.com/video/76979871", "vimeo"],
    ["https://www.tiktok.com/@scout2015/video/6718335390845095173?lang=en", "tiktok"],
    ["https://www.instagram.com/reel/C0abcDEF123/?igsh=xyz", "instagram"],
    ["https://fb.watch/abc123/", "facebook"],
    ["https://www.twitch.tv/videos/123456789", "twitch"],
    ["https://www.dailymotion.com/video/x8abc12", "dailymotion"],
    ["https://www.loom.com/share/0123456789abcdef", "loom"],
  ])("%s → %s", (url, kind) => {
    expect(info(url).kind).toBe(kind);
  });
  it("normalizes player.vimeo.com to the public page", () => {
    expect(info("https://player.vimeo.com/video/76979871").url).toBe("https://vimeo.com/76979871");
  });
});

describe("direct files", () => {
  it("detects playable formats by path extension, not by query or host", () => {
    const v = info("https://cdn.example.com/media/intro.MP4?token=abc");
    expect(v.kind).toBe("direct");
    expect(v.format).toBe("mp4");
    expect(v.playableInBrowser).toBe(true);
    expect(v.url).toBe("https://cdn.example.com/media/intro.MP4?token=abc");
  });
  it("flags HLS as not universally playable", () => {
    const v = info("https://cdn.example.com/live/stream.m3u8");
    expect(v.format).toBe("hls");
    expect(v.playableInBrowser).toBe(false);
  });
  it("does not treat a URL as video just because it says 'video'", () => {
    expect(info("https://example.com/video/about-us").kind).toBe("page");
    expect(info("https://video.example.com/").kind).toBe("page");
    expect(info("https://example.com/watch?file=movie.mp4").kind).toBe("page");
  });
  it("warns about http-only files", () => {
    expect(info("http://cdn.example.com/a.webm").notes.join(" ")).toMatch(/https/);
  });
});

it("rejects invalid input", () => {
  expect(classifyVideoUrl("").ok).toBe(false);
  expect(classifyVideoUrl("ftp://example.com/a.mp4").ok).toBe(false);
});
