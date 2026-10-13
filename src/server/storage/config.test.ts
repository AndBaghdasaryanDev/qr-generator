import { afterEach, describe, expect, it } from "vitest";
import { getVideoUploadConfig } from "./config";

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
});

describe("getVideoUploadConfig defaults", () => {
  it("stores videos in MongoDB when only MONGODB_URI is set", () => {
    process.env.MONGODB_URI = "mongodb://example";
    delete process.env.VIDEO_UPLOAD_DRIVER;
    delete process.env.VIDEO_MAX_UPLOAD_MB;
    delete process.env.VIDEO_STORAGE_QUOTA_GB;
    const quota = Math.round(0.4 * 1024 * 1024 * 1024);
    // No separate per-file cap: one video may use the whole video quota.
    expect(getVideoUploadConfig()).toEqual({ driver: "mongodb", maxBytes: quota, quotaBytes: quota });
  });

  it("still honours an explicit per-file limit", () => {
    process.env.MONGODB_URI = "mongodb://example";
    process.env.VIDEO_MAX_UPLOAD_MB = "20";
    expect(getVideoUploadConfig().maxBytes).toBe(20 * 1024 * 1024);
  });

  it("turns uploads off without a database", () => {
    delete process.env.MONGODB_URI;
    delete process.env.VIDEO_UPLOAD_DRIVER;
    expect(getVideoUploadConfig().driver).toBe("disabled");
  });

  it("respects an explicit driver", () => {
    process.env.MONGODB_URI = "mongodb://example";
    process.env.VIDEO_UPLOAD_DRIVER = "disabled";
    expect(getVideoUploadConfig().driver).toBe("disabled");
  });
});
