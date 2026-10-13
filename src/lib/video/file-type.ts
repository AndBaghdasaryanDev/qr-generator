export type VideoFileType = { contentType: "video/mp4" | "video/webm" | "video/quicktime"; extension: "mp4" | "webm" | "mov" };

/** Bytes needed by sniffVideoType. */
export const VIDEO_SNIFF_BYTES = 16;

/**
 * Identifies MP4/M4V, QuickTime (MOV) and WebM files from their first bytes.
 * The file name and the browser-reported MIME type are never trusted.
 */
export function sniffVideoType(bytes: Uint8Array): VideoFileType | null {
  // ISO base media (MP4/MOV): [size:4]["ftyp"][major brand:4]
  if (bytes.length >= 12 && bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
    const brand = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
    return brand === "qt  " ? { contentType: "video/quicktime", extension: "mov" } : { contentType: "video/mp4", extension: "mp4" };
  }
  // Matroska/WebM EBML header.
  if (bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) {
    return { contentType: "video/webm", extension: "webm" };
  }
  return null;
}

export const ACCEPTED_VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"] as const;

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
