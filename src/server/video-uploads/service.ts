import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ACCEPTED_VIDEO_TYPES, formatBytes, sniffVideoType, VIDEO_SNIFF_BYTES } from "@/lib/video/file-type";
import type { Database } from "@/server/db/client";
import type { VideoAssetDoc } from "@/server/db/types";
import { generateManageToken, hashToken, tokenMatches } from "@/server/dynamic-qr/crypto";
import { ForbiddenError, NotFoundError, QuotaExceededError, ValidationError, zodToValidationError } from "@/server/errors";
import type { VideoUploadConfig } from "@/server/storage/config";
import { LocalVideoStorage, UploadTooLargeError } from "@/server/storage/local";
import type { UploadTarget, VideoStorage } from "@/server/storage/types";

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const UPLOAD_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
/** Uploads that are never finished or never attached to a QR code are removed after this. */
export const STALE_UPLOAD_MS = 24 * 60 * 60 * 1000;

const EXTENSIONS: Record<(typeof ACCEPTED_VIDEO_TYPES)[number], string> = {
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
};

/** Display-only name: strips paths and control characters, keeps Unicode. */
export function sanitizeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const cleaned = base.replace(/[\u0000-\u001f\u007f<>"]/g, "").trim().slice(0, 120);
  return cleaned || "video";
}

export function createUploadSchema(maxBytes: number) {
  return z
    .object({
      fileName: z.string().max(1000),
      sizeBytes: z
        .number()
        .int()
        .min(1, "The file is empty.")
        .max(maxBytes, `Videos can be at most ${formatBytes(maxBytes)} on this server.`),
      contentType: z.enum(ACCEPTED_VIDEO_TYPES, { message: "Upload an MP4, WebM or MOV video." }),
    })
    .strict();
}

export interface UploadCredentials {
  id: string;
  token: string;
}

export const uploadCredentialsSchema = z
  .object({
    id: z.string().regex(UUID_PATTERN, "Invalid upload id."),
    token: z.string().regex(UPLOAD_TOKEN_PATTERN, "Invalid upload token."),
  })
  .strict();

async function findAsset(db: Database, id: string): Promise<VideoAssetDoc | null> {
  if (!UUID_PATTERN.test(id)) return null;
  return db.videoAssets.findOne({ _id: id });
}

/** Looks up an asset and checks the upload token. */
export async function authorizeUpload(db: Database, id: string, token: string | null): Promise<VideoAssetDoc> {
  const asset = await findAsset(db, id);
  if (!asset || asset.status === "deleted") throw new NotFoundError("Upload not found.");
  if (!token || !tokenMatches(token, asset.uploadTokenHash)) throw new ForbiddenError("Invalid upload token.");
  return asset;
}

async function storedBytes(db: Database): Promise<number> {
  const [result] = await db.videoAssets
    .aggregate<{ total: number }>([
      { $match: { status: { $in: ["pending", "ready"] } } },
      { $group: { _id: null, total: { $sum: "$sizeBytes" } } },
    ])
    .toArray();
  return result?.total ?? 0;
}

/** Step 1: reserve an upload and return where the browser should send the file. */
export async function createUpload(
  db: Database,
  storage: VideoStorage,
  config: VideoUploadConfig,
  rawInput: unknown,
  localUploadUrl: (id: string) => string,
): Promise<{ uploadId: string; uploadToken: string; target: UploadTarget }> {
  const parsed = createUploadSchema(config.maxBytes).safeParse(rawInput);
  if (!parsed.success) throw zodToValidationError(parsed.error);
  const input = parsed.data;

  if ((await storedBytes(db)) + input.sizeBytes > config.quotaBytes) {
    throw new QuotaExceededError("This server's video storage is full. Please try again later or use a video link instead.");
  }

  const id = randomUUID();
  const token = generateManageToken();
  const storageKey = `videos/${id}.${EXTENSIONS[input.contentType]}`;
  await db.videoAssets.insertOne({
    _id: id,
    storageKey,
    contentType: input.contentType,
    sizeBytes: input.sizeBytes,
    originalName: sanitizeFileName(input.fileName),
    status: "pending",
    uploadTokenHash: hashToken(token),
    qrCodeId: null,
    createdAt: new Date(),
    deletedAt: null,
  });
  const target = await storage.createUploadTarget(storageKey, input.contentType, localUploadUrl(id));
  // The local endpoint authenticates the PUT itself; presigned URLs carry their own signature.
  if (storage.driver === "local") target.headers["X-Upload-Token"] = token;
  return { uploadId: id, uploadToken: token, target };
}

/** Verifies the stored bytes really are the declared, allowed kind of video. */
function verifiedType(asset: VideoAssetDoc, head: Uint8Array): string {
  const detected = sniffVideoType(head);
  const family = (type: string) => (type === "video/webm" ? "webm" : "iso");
  if (!detected || family(detected.contentType) !== family(asset.contentType)) {
    throw new ValidationError("This file isn't a valid MP4, WebM or MOV video.");
  }
  return detected.contentType;
}

async function markReady(db: Database, asset: VideoAssetDoc, contentType: string) {
  await db.videoAssets.updateOne({ _id: asset._id, status: "pending" }, { $set: { status: "ready", contentType } });
}

/** Step 2 (local driver only): receive the file body directly. */
export async function receiveLocalUpload(
  db: Database,
  storage: VideoStorage,
  asset: VideoAssetDoc,
  body: ReadableStream<Uint8Array> | null,
): Promise<void> {
  if (!(storage instanceof LocalVideoStorage)) throw new ValidationError("Uploads go directly to object storage on this server.");
  if (asset.status !== "pending") throw new ValidationError("This upload is already finished.");
  if (!body) throw new ValidationError("No file was sent.");
  try {
    const { bytes, head } = await storage.write(asset.storageKey, body, asset.sizeBytes);
    if (bytes !== asset.sizeBytes) throw new ValidationError("The upload was incomplete. Please try again.");
    await markReady(db, asset, verifiedType(asset, head));
  } catch (error) {
    await storage.delete(asset.storageKey).catch(() => undefined);
    if (error instanceof UploadTooLargeError) throw new ValidationError("The file is larger than declared.");
    throw error;
  }
}

/** Step 3: confirm the upload. For object storage this is where size and type are checked. */
export async function completeUpload(db: Database, storage: VideoStorage, config: VideoUploadConfig, asset: VideoAssetDoc) {
  if (asset.status === "ready") return;
  const size = await storage.size(asset.storageKey);
  if (size === null) throw new ValidationError("The file hasn't arrived in storage yet. Please retry the upload.");
  try {
    if (size !== asset.sizeBytes || size > config.maxBytes) throw new ValidationError("The uploaded file doesn't match the declared size.");
    await markReady(db, asset, verifiedType(asset, await storage.readHead(asset.storageKey, VIDEO_SNIFF_BYTES)));
  } catch (error) {
    await deleteAsset(db, storage, asset);
    throw error;
  }
}

/**
 * Atomically claims a finished, unattached upload for a code. The single conditional
 * update means two requests can never attach the same video.
 */
export async function claimAsset(db: Database, credentials: UploadCredentials, qrCodeId: string): Promise<VideoAssetDoc> {
  const asset = await authorizeUpload(db, credentials.id, credentials.token);
  if (asset.status !== "ready") throw new ValidationError("The video upload hasn't finished yet.", "upload");
  const claimed = await db.videoAssets.findOneAndUpdate(
    { _id: asset._id, status: "ready", qrCodeId: null },
    { $set: { qrCodeId } },
    { returnDocument: "after" },
  );
  if (!claimed) throw new ValidationError("This video is already used by a QR code.", "upload");
  return claimed;
}

/** Undo a claim when creating/updating the code failed afterwards. */
export async function releaseAsset(db: Database, assetId: string, qrCodeId: string): Promise<void> {
  await db.videoAssets.updateOne({ _id: assetId, qrCodeId }, { $set: { qrCodeId: null } });
}

export async function getAsset(db: Database, id: string | null): Promise<VideoAssetDoc | null> {
  return id ? findAsset(db, id) : null;
}

export async function deleteAsset(db: Database, storage: VideoStorage | null, asset: VideoAssetDoc): Promise<void> {
  await db.videoAssets.updateOne({ _id: asset._id }, { $set: { status: "deleted", deletedAt: new Date() } });
  if (storage) {
    // A failed storage delete leaves an orphaned object but never resurrects access:
    // the media route only serves assets marked "ready".
    await storage.delete(asset.storageKey).catch((error: unknown) => console.error("Failed to delete video object", error));
  }
}

/** Removes uploads that were abandoned: never finished, or never attached to a code. */
export async function cleanupStaleUploads(db: Database, storage: VideoStorage, now = Date.now()): Promise<number> {
  const stale = await db.videoAssets
    .find({
      createdAt: { $lt: new Date(now - STALE_UPLOAD_MS) },
      $or: [{ status: "pending" }, { status: "ready", qrCodeId: null }],
    })
    .limit(100)
    .toArray();
  for (const asset of stale) await deleteAsset(db, storage, asset);
  return stale.length;
}
