import "server-only";
import path from "node:path";
import { LocalVideoStorage } from "./local";
import { S3VideoStorage } from "./s3";
import type { VideoStorage } from "./types";

export type UploadDriver = "local" | "s3" | "disabled";

export interface VideoUploadConfig {
  driver: UploadDriver;
  maxBytes: number;
  quotaBytes: number;
}

const MB = 1024 * 1024;

function positiveNumber(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * Uploads are on by default only in development (local disk). In production the operator
 * must opt in explicitly, because hosting videos costs storage and bandwidth and needs
 * an abuse-handling plan.
 */
export function getVideoUploadConfig(): VideoUploadConfig {
  const configured = process.env.VIDEO_UPLOAD_DRIVER as UploadDriver | undefined;
  const driver: UploadDriver =
    configured === "local" || configured === "s3" || configured === "disabled"
      ? configured
      : process.env.NODE_ENV === "production"
        ? "disabled"
        : "local";
  return {
    driver,
    maxBytes: Math.round(positiveNumber(process.env.VIDEO_MAX_UPLOAD_MB, 100) * MB),
    quotaBytes: Math.round(positiveNumber(process.env.VIDEO_STORAGE_QUOTA_GB, 5) * 1024 * MB),
  };
}

export class UploadsDisabledError extends Error {
  constructor() {
    super("Video uploads aren't enabled on this server.");
    this.name = "UploadsDisabledError";
  }
}

/** Storage for cleanup operations; null when uploads are disabled or misconfigured. */
export function getVideoStorageOrNull(): VideoStorage | null {
  try {
    return getVideoStorage();
  } catch {
    return null;
  }
}

let cached: { signature: string; storage: VideoStorage } | null = null;

export function getVideoStorage(): VideoStorage {
  const { driver } = getVideoUploadConfig();
  const signature = [driver, process.env.VIDEO_STORAGE_DIR, process.env.VIDEO_S3_ENDPOINT, process.env.VIDEO_S3_BUCKET].join("|");
  if (cached?.signature === signature) return cached.storage;

  let storage: VideoStorage;
  if (driver === "local") {
    storage = new LocalVideoStorage(path.resolve(process.env.VIDEO_STORAGE_DIR || "storage/videos"));
  } else if (driver === "s3") {
    const { VIDEO_S3_ENDPOINT, VIDEO_S3_BUCKET, VIDEO_S3_ACCESS_KEY_ID, VIDEO_S3_SECRET_ACCESS_KEY } = process.env;
    if (!VIDEO_S3_ENDPOINT || !VIDEO_S3_BUCKET || !VIDEO_S3_ACCESS_KEY_ID || !VIDEO_S3_SECRET_ACCESS_KEY) {
      console.error("VIDEO_UPLOAD_DRIVER=s3 needs VIDEO_S3_ENDPOINT, VIDEO_S3_BUCKET, VIDEO_S3_ACCESS_KEY_ID and VIDEO_S3_SECRET_ACCESS_KEY.");
      throw new UploadsDisabledError();
    }
    storage = new S3VideoStorage({
      endpoint: VIDEO_S3_ENDPOINT,
      bucket: VIDEO_S3_BUCKET,
      region: process.env.VIDEO_S3_REGION || "auto",
      accessKeyId: VIDEO_S3_ACCESS_KEY_ID,
      secretAccessKey: VIDEO_S3_SECRET_ACCESS_KEY,
    });
  } else {
    throw new UploadsDisabledError();
  }
  cached = { signature, storage };
  return storage;
}
