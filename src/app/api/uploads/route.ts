import { after, connection } from "next/server";
import { getDb } from "@/server/db/client";
import { handleError, json, jsonError, readJsonBody } from "@/server/http";
import { limits } from "@/server/limits";
import { clientKey } from "@/server/rate-limit";
import { getVideoStorage, getVideoUploadConfig } from "@/server/storage/config";
import { cleanupStaleUploads, createUpload } from "@/server/video-uploads/service";

/** Tells the client whether uploads are available and how large they may be. */
export async function GET(): Promise<Response> {
  // Read the environment at request time; otherwise this response would be prerendered at build.
  await connection();
  const config = getVideoUploadConfig();
  return json({ enabled: config.driver !== "disabled", driver: config.driver, maxBytes: config.maxBytes });
}

/** Reserves an upload: returns an upload id, a one-time token and where to send the file. */
export async function POST(request: Request): Promise<Response> {
  const limit = limits.upload.check(clientKey(request.headers));
  if (!limit.allowed) {
    return jsonError(429, "rate_limited", "You've uploaded several videos recently. Please wait before uploading more.", {
      "Retry-After": String(limit.retryAfterSeconds),
    });
  }
  try {
    const config = getVideoUploadConfig();
    const storage = getVideoStorage();
    const db = await getDb();
    const body = await readJsonBody(request);
    // Same-origin relative URL: works regardless of which hostname the visitor used.
    const result = await createUpload(db, storage, config, body, (id) => `/api/uploads/${id}/content`);

    // Opportunistic housekeeping, after the response, so no cron job is required.
    try {
      after(() => cleanupStaleUploads(db, storage).catch((error: unknown) => console.error("Upload cleanup failed", error)));
    } catch {
      // Outside a request scope (tests): skip.
    }
    return json({ ...result, maxBytes: config.maxBytes }, { status: 201 });
  } catch (error) {
    return handleError(error);
  }
}
