import type { Binary } from "mongodb";
import type { DynamicQrType, Presentation } from "@/lib/dynamic-types";

/**
 * Dynamic QR codes (collection `qr_codes`). There are no user accounts: ownership is
 * proven with a secret management token, of which only a SHA-256 hash is stored.
 */
export interface QrCodeDoc {
  /** UUID. */
  _id: string;
  /** Public short code used in /r/{publicCode}. Unique; never reused, even after deletion. */
  publicCode: string;
  manageTokenHash: string;
  name: string;
  qrType: DynamicQrType;
  destinationUrl: string;
  presentation: Presentation;
  /** Colors and shapes (StoredQrStyle); uploaded logos are never stored. */
  style: unknown;
  isActive: boolean;
  /** Aggregate counter only — no per-scan IPs, user agents or locations are stored. */
  scanCount: number;
  lastScannedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  /** Soft delete keeps the code reserved so a printed code can't be re-registered by someone else. */
  deletedAt: Date | null;
  /** Set when the destination is a video uploaded to this service instead of an external link. */
  videoAssetId: string | null;
}

export const VIDEO_ASSET_STATUSES = ["pending", "ready", "deleted"] as const;
export type VideoAssetStatus = (typeof VIDEO_ASSET_STATUSES)[number];

/**
 * Uploaded video files (collection `video_assets`). The bytes live in object storage or on
 * disk; only metadata is stored here. The original file name is display-only.
 */
export interface VideoAssetDoc {
  /** UUID. */
  _id: string;
  storageKey: string;
  /** Detected from the file's magic bytes, not taken from the client. */
  contentType: string;
  /** Size declared by the uploader, verified when the upload completes. */
  sizeBytes: number;
  originalName: string;
  status: VideoAssetStatus;
  /** Proves the right to finish and attach this upload; only the hash is stored. */
  uploadTokenHash: string;
  qrCodeId: string | null;
  createdAt: Date;
  deletedAt: Date | null;
  /** Bytes received so far by the chunked MongoDB (GridFS) upload driver. */
  receivedBytes?: number;
}

/** GridFS-compatible file record (collection `videos.files`), used by the MongoDB storage driver. */
export interface GridFsFileDoc {
  /** The asset's storage key. */
  _id: string;
  length: number;
  chunkSize: number;
  uploadDate: Date;
  filename: string;
  metadata: { contentType: string };
}

/** GridFS-compatible chunk (collection `videos.chunks`). */
export interface GridFsChunkDoc {
  files_id: string;
  n: number;
  data: Binary;
}
