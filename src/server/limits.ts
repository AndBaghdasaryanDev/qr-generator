import { RateLimiter } from "./rate-limit";

const TEN_MINUTES = 10 * 60 * 1000;
const ONE_HOUR = 60 * 60 * 1000;

/** Per-IP limits for the dynamic-QR API. Scans (/r/…) are intentionally never limited. */
export const limits = {
  create: new RateLimiter(Number(process.env.RATE_LIMIT_CREATE_PER_10_MIN) || 30, TEN_MINUTES),
  manage: new RateLimiter(Number(process.env.RATE_LIMIT_MANAGE_PER_10_MIN) || 300, TEN_MINUTES),
  upload: new RateLimiter(Number(process.env.RATE_LIMIT_UPLOADS_PER_HOUR) || 10, ONE_HOUR),
  admin: new RateLimiter(20, TEN_MINUTES),
};
