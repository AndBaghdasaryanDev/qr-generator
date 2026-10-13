import "server-only";
import { MongoServerError, MongoServerSelectionError } from "mongodb";
import { DatabaseNotConfiguredError } from "@/server/db/client";
import { MANAGE_TOKEN_PATTERN } from "@/server/dynamic-qr/crypto";
import { ConflictError, ForbiddenError, NotFoundError, QuotaExceededError, ValidationError } from "@/server/errors";
import { UploadsDisabledError } from "@/server/storage/config";
import { StorageError } from "@/server/storage/types";

const MAX_BODY_BYTES = 16 * 1024;

const NO_STORE = { "Cache-Control": "no-store" };

export function json(data: unknown, init: ResponseInit = {}): Response {
  return Response.json(data, { ...init, headers: { ...NO_STORE, ...init.headers } });
}

export function jsonError(status: number, code: string, message: string, headers: HeadersInit = {}): Response {
  return json({ error: { code, message } }, { status, headers });
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function readJsonBody(request: Request): Promise<unknown> {
  const type = request.headers.get("content-type") ?? "";
  if (!type.toLowerCase().startsWith("application/json")) {
    throw new HttpError(415, "unsupported_media_type", "Send the request body as application/json.");
  }
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > MAX_BODY_BYTES) throw new HttpError(413, "payload_too_large", "Request body is too large.");
  const text = await request.text();
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) {
    throw new HttpError(413, "payload_too_large", "Request body is too large.");
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new HttpError(400, "invalid_json", "Request body is not valid JSON.");
  }
}

/** Reads `Authorization: Bearer <token>`; malformed tokens are treated as absent. */
export function bearerToken(request: Request): string | null {
  const match = /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") ?? "");
  const token = match?.[1] ?? null;
  return token && MANAGE_TOKEN_PATTERN.test(token) ? token : null;
}

/** Reads the upload token sent with `X-Upload-Token`; malformed tokens are treated as absent. */
export function uploadTokenFrom(request: Request): string | null {
  const token = request.headers.get("x-upload-token");
  return token && MANAGE_TOKEN_PATTERN.test(token) ? token : null;
}

/**
 * Public origin used to build short links. APP_URL should always be set in production so
 * printed codes point at the canonical domain rather than whatever Host header arrived.
 */
export function appOrigin(request: Request): string {
  const configured = process.env.APP_URL;
  if (configured) {
    try {
      return new URL(configured).origin;
    } catch {
      console.error("APP_URL is not a valid URL; falling back to the request origin.");
    }
  }
  return new URL(request.url).origin;
}

/** Maps known failures to safe JSON responses; never leaks stack traces or SQL. */
export function handleError(error: unknown): Response {
  if (error instanceof HttpError) return jsonError(error.status, error.code, error.message);
  if (error instanceof ValidationError) {
    return json({ error: { code: "validation_error", message: error.message, field: error.field } }, { status: 400 });
  }
  if (error instanceof NotFoundError) return jsonError(404, "not_found", error.message);
  if (error instanceof ForbiddenError) return jsonError(403, "forbidden", error.message);
  if (error instanceof ConflictError) return jsonError(409, "conflict", error.message);
  if (error instanceof QuotaExceededError) return jsonError(507, "storage_full", error.message);
  if (error instanceof UploadsDisabledError) return jsonError(503, "uploads_disabled", error.message);
  if (error instanceof StorageError) {
    console.error("Video storage error:", error.message);
    return jsonError(502, "storage_error", "The video storage service didn't respond correctly. Please try again.");
  }
  if (error instanceof DatabaseNotConfiguredError) {
    console.error("MONGODB_URI is not set; dynamic QR codes are disabled.");
    return jsonError(503, "storage_not_configured", "Dynamic QR codes aren't available on this server (no database configured).");
  }
  if (error instanceof MongoServerSelectionError) {
    console.error(
      "Can't reach MongoDB. Check MONGODB_URI and that Atlas Network Access allows this server's IP.",
      error.message,
    );
  } else if (error instanceof MongoServerError && (error.code === 18 || error.codeName === "AtlasError")) {
    console.error("MongoDB rejected the credentials in MONGODB_URI.", error.message);
  } else {
    console.error("Unhandled API error:", error);
  }
  return jsonError(503, "storage_unavailable", "Dynamic QR storage is temporarily unavailable. Please try again.");
}
