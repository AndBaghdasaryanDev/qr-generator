import QRCode from "qrcode";
import type { ErrorCorrectionLevel } from "./style";

/**
 * Maximum payload size in bytes (byte mode, version 40) per error-correction level.
 * Numeric/alphanumeric-only content can hold more, but byte mode is the realistic
 * ceiling for URLs and Unicode text.
 */
export const MAX_BYTE_CAPACITY: Record<ErrorCorrectionLevel, number> = {
  L: 2953,
  M: 2331,
  Q: 1663,
  H: 1273,
};

/** Above this many bytes codes get dense enough that small prints become hard to scan. */
export const DENSE_PAYLOAD_BYTES = 300;

export interface QrMatrix {
  /** Number of modules per side (21 for version 1 … 177 for version 40). */
  size: number;
  version: number;
  errorCorrection: ErrorCorrectionLevel;
  /** Row-major, 1 = dark module. */
  modules: Uint8Array;
}

export type EncodeResult =
  | { ok: true; matrix: QrMatrix; byteLength: number }
  | { ok: false; reason: "empty" | "too-long" | "failed"; message: string; byteLength: number };

export function utf8ByteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

export function isDark(matrix: QrMatrix, row: number, col: number): boolean {
  return matrix.modules[row * matrix.size + col] === 1;
}

export function encodeQr(payload: string, errorCorrection: ErrorCorrectionLevel): EncodeResult {
  const byteLength = utf8ByteLength(payload);
  if (payload.length === 0) {
    return { ok: false, reason: "empty", message: "Nothing to encode yet.", byteLength };
  }
  if (byteLength > MAX_BYTE_CAPACITY[errorCorrection]) {
    return {
      ok: false,
      reason: "too-long",
      message: tooLongMessage(byteLength, errorCorrection),
      byteLength,
    };
  }
  try {
    const qr = QRCode.create(payload, { errorCorrectionLevel: errorCorrection });
    const { size, data } = qr.modules;
    return {
      ok: true,
      byteLength,
      matrix: {
        size,
        version: qr.version,
        errorCorrection,
        modules: Uint8Array.from(data, (v) => (v ? 1 : 0)),
      },
    };
  } catch (error) {
    // The library throws when mixed-mode segmentation still exceeds capacity.
    const message = error instanceof Error ? error.message : "";
    if (/too big|amount of data/i.test(message)) {
      return {
        ok: false,
        reason: "too-long",
        message: tooLongMessage(byteLength, errorCorrection),
        byteLength,
      };
    }
    return {
      ok: false,
      reason: "failed",
      message: "This content could not be encoded as a QR code.",
      byteLength,
    };
  }
}

function tooLongMessage(byteLength: number, level: ErrorCorrectionLevel): string {
  return (
    `This content is ${byteLength.toLocaleString("en-US")} bytes, but a QR code at error-correction level ${level} ` +
    `holds at most ${MAX_BYTE_CAPACITY[level].toLocaleString("en-US")} bytes. Shorten it, lower the error correction, ` +
    `or host the content online and encode a link to it instead.`
  );
}
