import { randomUUID } from "node:crypto";
import { MongoServerError } from "mongodb";
import { z } from "zod";
import { DYNAMIC_QR_TYPES, PRESENTATIONS, type Presentation } from "@/lib/dynamic-types";
import { DEFAULT_QR_STYLE, storedQrStyleSchema, type StoredQrStyle } from "@/lib/qr/style";
import { isPrivateHost, parseWebUrl } from "@/lib/validation/url";
import { classifyVideoUrl } from "@/lib/video/classify";
import type { Database } from "@/server/db/client";
import type { QrCodeDoc, VideoAssetDoc } from "@/server/db/types";
import { ValidationError, zodToValidationError } from "@/server/errors";
import type { VideoStorage } from "@/server/storage/types";
import { claimAsset, deleteAsset, getAsset, releaseAsset, uploadCredentialsSchema } from "@/server/video-uploads/service";
import { generateManageToken, generatePublicCode, hashToken, PUBLIC_CODE_PATTERN, tokenMatches } from "./crypto";

export { ValidationError, zodToValidationError };

/* ------------------------------------------------------------------ */
/* Input validation                                                    */
/* ------------------------------------------------------------------ */

const { foreground, background, margin, errorCorrection, moduleStyle, finderStyle } = DEFAULT_QR_STYLE;
const DEFAULT_STORED_STYLE: StoredQrStyle = { foreground, background, margin, errorCorrection, moduleStyle, finderStyle };

const nameSchema = z.string().trim().min(1, "Give the QR code a name.").max(80, "Names are at most 80 characters.");

/** A dynamic code points either to an external link or to a video uploaded here — never both. */
export const createInputSchema = z
  .object({
    name: nameSchema.default("Untitled QR code"),
    qrType: z.enum(DYNAMIC_QR_TYPES),
    destinationUrl: z.string().max(4096).optional(),
    upload: uploadCredentialsSchema.optional(),
    presentation: z.enum(PRESENTATIONS).optional(),
    style: storedQrStyleSchema.default(DEFAULT_STORED_STYLE),
  })
  .strict()
  .refine((v) => (v.destinationUrl === undefined) !== (v.upload === undefined), {
    message: "Provide either a destination link or an uploaded video.",
    path: ["destinationUrl"],
  })
  .refine((v) => v.upload === undefined || v.qrType === "video", {
    message: "Uploaded files are only supported for video QR codes.",
    path: ["qrType"],
  });
export type CreateInput = z.input<typeof createInputSchema>;

export const updateInputSchema = z
  .object({
    name: nameSchema.optional(),
    destinationUrl: z.string().max(4096).optional(),
    upload: uploadCredentialsSchema.optional(),
    presentation: z.enum(PRESENTATIONS).optional(),
    style: storedQrStyleSchema.optional(),
    isActive: z.boolean().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, "Nothing to update.")
  .refine((v) => v.destinationUrl === undefined || v.upload === undefined, {
    message: "Provide either a destination link or an uploaded video, not both.",
    path: ["destinationUrl"],
  });
export type UpdateInput = z.input<typeof updateInputSchema>;

/**
 * Server-side destination check. The URL is validated syntactically only — the server
 * never fetches it, so there is no SSRF surface.
 */
export function validateDestination(input: string, appOrigin: string): string {
  const parsed = parseWebUrl(input);
  if (!parsed.ok) throw new ValidationError(parsed.error, "destinationUrl");
  if (isPrivateHost(parsed.url.hostname)) {
    throw new ValidationError("Destinations on private or local networks aren't allowed.", "destinationUrl");
  }
  if (parsed.url.origin === appOrigin && parsed.url.pathname.startsWith("/r/")) {
    throw new ValidationError("A dynamic QR code can't point to another dynamic QR code.", "destinationUrl");
  }
  const blocked = (process.env.BLOCKED_DESTINATION_HOSTS ?? "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  const host = parsed.url.hostname.toLowerCase();
  if (blocked.some((b) => host === b || host.endsWith(`.${b}`))) {
    throw new ValidationError("This destination isn't allowed.", "destinationUrl");
  }
  return parsed.href;
}

/** The branded player only makes sense for files a <video> element can actually play. */
function validatePlayerLink(destination: string) {
  const video = classifyVideoUrl(destination);
  if (!video.ok || video.info.kind !== "direct" || !video.info.playableInBrowser) {
    throw new ValidationError("The video player page is only available for direct video files (MP4, WebM…).", "presentation");
  }
  if (!destination.startsWith("https://")) {
    throw new ValidationError("The video player page requires an https:// video link.", "presentation");
  }
}

function canUsePlayerForLink(destination: string): boolean {
  try {
    validatePlayerLink(destination);
    return true;
  } catch {
    return false;
  }
}

/** Path under which uploaded videos are served. Stored as the code's destination for reference. */
export function mediaPath(assetId: string): string {
  return `/media/${assetId}`;
}

/* ------------------------------------------------------------------ */
/* Views                                                               */
/* ------------------------------------------------------------------ */

export type DynamicQrSource =
  | { kind: "link" }
  | { kind: "upload"; fileName: string; sizeBytes: number; contentType: string };

export interface DynamicQrView {
  code: string;
  shortUrl: string;
  name: string;
  qrType: QrCodeDoc["qrType"];
  /** External link, or the absolute media URL for uploaded videos. */
  destinationUrl: string;
  source: DynamicQrSource;
  presentation: QrCodeDoc["presentation"];
  style: StoredQrStyle;
  isActive: boolean;
  scanCount: number;
  lastScannedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

function parseStoredStyle(raw: unknown): StoredQrStyle {
  const parsed = storedQrStyleSchema.safeParse(raw);
  return parsed.success ? parsed.data : DEFAULT_STORED_STYLE;
}

export function shortUrlFor(appOrigin: string, code: string): string {
  return `${appOrigin}/r/${code}`;
}

/** Owner view. Never includes the token hash, internal ids or storage keys. */
export function toView(row: QrCodeDoc, appOrigin: string, asset: VideoAssetDoc | null = null): DynamicQrView {
  const upload = row.videoAssetId && asset && asset._id === row.videoAssetId ? asset : null;
  return {
    code: row.publicCode,
    shortUrl: shortUrlFor(appOrigin, row.publicCode),
    name: row.name,
    qrType: row.qrType,
    destinationUrl: upload ? `${appOrigin}${mediaPath(upload._id)}` : row.destinationUrl,
    source: upload
      ? { kind: "upload", fileName: upload.originalName, sizeBytes: upload.sizeBytes, contentType: upload.contentType }
      : { kind: "link" },
    presentation: row.presentation,
    style: parseStoredStyle(row.style),
    isActive: row.isActive,
    scanCount: row.scanCount,
    lastScannedAt: row.lastScannedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function loadView(db: Database, row: QrCodeDoc, appOrigin: string): Promise<DynamicQrView> {
  return toView(row, appOrigin, await getAsset(db, row.videoAssetId));
}

/* ------------------------------------------------------------------ */
/* Operations                                                          */
/* ------------------------------------------------------------------ */

export async function findByCode(db: Database, code: string): Promise<QrCodeDoc | null> {
  if (!PUBLIC_CODE_PATTERN.test(code)) return null;
  return db.qrCodes.findOne({ publicCode: code });
}

function isDuplicateKey(error: unknown): boolean {
  return error instanceof MongoServerError && error.code === 11000;
}

export async function createDynamicQr(
  db: Database,
  rawInput: unknown,
  appOrigin: string,
): Promise<{ view: DynamicQrView; manageToken: string }> {
  const parsed = createInputSchema.safeParse(rawInput);
  if (!parsed.success) throw zodToValidationError(parsed.error);
  const input = parsed.data;
  const id = randomUUID();

  let destinationUrl: string;
  let asset: VideoAssetDoc | null = null;
  let presentation: Presentation;
  if (input.upload) {
    asset = await claimAsset(db, input.upload, id);
    destinationUrl = mediaPath(asset._id);
    presentation = input.presentation ?? "player";
  } else {
    destinationUrl = validateDestination(input.destinationUrl ?? "", appOrigin);
    presentation = input.presentation ?? "redirect";
    if (presentation === "player") validatePlayerLink(destinationUrl);
  }

  const manageToken = generateManageToken();
  const now = new Date();
  try {
    // A collision among 62^10 codes is astronomically unlikely, but the unique index makes
    // it safe to retry rather than assume.
    for (let attempt = 0; attempt < 5; attempt++) {
      const row: QrCodeDoc = {
        _id: id,
        publicCode: generatePublicCode(),
        manageTokenHash: hashToken(manageToken),
        name: input.name,
        qrType: input.qrType,
        destinationUrl,
        presentation,
        style: input.style,
        isActive: true,
        scanCount: 0,
        lastScannedAt: null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        videoAssetId: asset?._id ?? null,
      };
      try {
        await db.qrCodes.insertOne(row);
        return { view: toView(row, appOrigin, asset), manageToken };
      } catch (error) {
        if (!isDuplicateKey(error) || attempt === 4) throw error;
      }
    }
    throw new Error("Could not allocate a unique code.");
  } catch (error) {
    if (asset) await releaseAsset(db, asset._id, id);
    throw error;
  }
}

export type OwnedLookup =
  | { status: "ok"; row: QrCodeDoc }
  | { status: "not-found" }
  | { status: "forbidden" };

/** Resolves a code for its owner. Deleted codes are reported as not found. */
export async function getOwnedQr(db: Database, code: string, token: string | null): Promise<OwnedLookup> {
  const row = await findByCode(db, code);
  if (!row || row.deletedAt) return { status: "not-found" };
  if (!token || !tokenMatches(token, row.manageTokenHash)) return { status: "forbidden" };
  return { status: "ok", row };
}

/**
 * Updates a code. Switching to a link or to a new upload removes the previously uploaded
 * video from storage, so replaced files don't keep consuming space.
 */
export async function updateDynamicQr(
  db: Database,
  row: QrCodeDoc,
  rawPatch: unknown,
  appOrigin: string,
  storage: VideoStorage | null,
): Promise<DynamicQrView> {
  const parsed = updateInputSchema.safeParse(rawPatch);
  if (!parsed.success) throw zodToValidationError(parsed.error);
  const patch = parsed.data;

  const previousAsset = await getAsset(db, row.videoAssetId);
  let destinationUrl = row.destinationUrl;
  let asset: VideoAssetDoc | null = previousAsset;
  let claimed: VideoAssetDoc | null = null;

  if (patch.upload) {
    if (row.qrType !== "video") throw new ValidationError("Uploaded files are only supported for video QR codes.", "upload");
    claimed = await claimAsset(db, patch.upload, row._id);
    asset = claimed;
    destinationUrl = mediaPath(claimed._id);
  } else if (patch.destinationUrl !== undefined) {
    asset = null;
    destinationUrl = validateDestination(patch.destinationUrl, appOrigin);
  }

  let updated: QrCodeDoc | null;
  try {
    // An explicit request for the player must be valid; a destination change that makes an
    // existing player setting impossible falls back to a plain redirect.
    if (patch.presentation === "player" && !asset) validatePlayerLink(destinationUrl);
    const wanted = patch.presentation ?? row.presentation;
    const presentation: Presentation = wanted === "player" && !asset && !canUsePlayerForLink(destinationUrl) ? "redirect" : wanted;

    updated = await db.qrCodes.findOneAndUpdate(
      { _id: row._id, deletedAt: null },
      {
        $set: {
          name: patch.name ?? row.name,
          destinationUrl,
          presentation,
          style: patch.style ?? row.style,
          isActive: patch.isActive ?? row.isActive,
          videoAssetId: asset?._id ?? null,
          updatedAt: new Date(),
        },
      },
      { returnDocument: "after" },
    );
  } catch (error) {
    if (claimed) await releaseAsset(db, claimed._id, row._id);
    throw error;
  }
  if (!updated) {
    if (claimed) await releaseAsset(db, claimed._id, row._id);
    throw new ValidationError("This QR code was deleted.");
  }

  if (previousAsset && previousAsset._id !== asset?._id) await deleteAsset(db, storage, previousAsset);
  return toView(updated, appOrigin, asset);
}

/** Soft-deletes the code (keeping its short link reserved) and removes any uploaded video. */
export async function softDeleteDynamicQr(db: Database, row: QrCodeDoc, storage: VideoStorage | null): Promise<void> {
  const now = new Date();
  await db.qrCodes.updateOne({ _id: row._id }, { $set: { deletedAt: now, isActive: false, updatedAt: now } });
  const asset = await getAsset(db, row.videoAssetId);
  if (asset && asset.status !== "deleted") await deleteAsset(db, storage, asset);
}

export type Resolution =
  | { status: "redirect"; url: string; id: string }
  | { status: "player"; url: string; id: string; name: string }
  | { status: "not-found" }
  | { status: "deleted" }
  | { status: "disabled" };

/** Public resolution for /r/{code}. Returns only what a visitor needs. */
export async function resolvePublicCode(db: Database, code: string, appOrigin: string): Promise<Resolution> {
  const row = await findByCode(db, code);
  if (!row) return { status: "not-found" };
  if (row.deletedAt) return { status: "deleted" };
  if (!row.isActive) return { status: "disabled" };

  if (row.videoAssetId) {
    const asset = await getAsset(db, row.videoAssetId);
    if (!asset || asset.status !== "ready" || asset.qrCodeId !== row._id) return { status: "disabled" };
    return row.presentation === "player"
      ? { status: "player", url: mediaPath(asset._id), id: row._id, name: row.name }
      : { status: "redirect", url: `${appOrigin}${mediaPath(asset._id)}`, id: row._id };
  }

  // Re-validate on the way out (defense in depth against records edited outside the API).
  let url: string;
  try {
    url = validateDestination(row.destinationUrl, appOrigin);
  } catch {
    return { status: "disabled" };
  }
  if (row.presentation === "player" && canUsePlayerForLink(url)) {
    return { status: "player", url, id: row._id, name: row.name };
  }
  return { status: "redirect", url, id: row._id };
}

/** Data for the /watch player page; null unless the code is active and set to "player". */
export async function getPlayerData(
  db: Database,
  code: string,
  appOrigin: string,
): Promise<{ url: string; name: string } | null> {
  const resolution = await resolvePublicCode(db, code, appOrigin);
  return resolution.status === "player" ? { url: resolution.url, name: resolution.name } : null;
}

/** Whether an uploaded video may be streamed right now (its code exists and is active). */
export async function isAssetServable(db: Database, asset: VideoAssetDoc): Promise<boolean> {
  if (asset.status !== "ready" || !asset.qrCodeId) return false;
  const row = await db.qrCodes.findOne({ _id: asset.qrCodeId });
  return Boolean(row && !row.deletedAt && row.isActive && row.videoAssetId === asset._id);
}

/** Atomic counter increment — concurrent scans never lose counts. */
export async function recordScan(db: Database, id: string): Promise<void> {
  await db.qrCodes.updateOne({ _id: id }, { $inc: { scanCount: 1 }, $set: { lastScannedAt: new Date() } });
}
