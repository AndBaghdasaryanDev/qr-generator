import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
export const PUBLIC_CODE_LENGTH = 10;
export const PUBLIC_CODE_PATTERN = /^[0-9A-Za-z]{10}$/;
export const MANAGE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/**
 * Unbiased base62 code from a CSPRNG (rejection sampling: bytes ≥ 248 are discarded,
 * since 248 = 4 × 62). 10 characters ≈ 59.5 bits, which keeps codes short enough
 * for low-density QR codes while making enumeration impractical.
 */
export function generatePublicCode(length = PUBLIC_CODE_LENGTH): string {
  let out = "";
  while (out.length < length) {
    for (const byte of randomBytes(length * 2)) {
      if (byte < 248) out += BASE62[byte % 62];
      if (out.length === length) break;
    }
  }
  return out;
}

/** 256-bit secret, base64url (43 chars). Only its hash is persisted. */
export function generateManageToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function tokenMatches(token: string, expectedHash: string): boolean {
  const actual = Buffer.from(hashToken(token), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
