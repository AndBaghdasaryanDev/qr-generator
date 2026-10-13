import { getDb } from "@/server/db/client";
import { isAssetServable } from "@/server/dynamic-qr/service";
import { parseRange } from "@/server/range";
import { getVideoStorageOrNull } from "@/server/storage/config";
import { S3VideoStorage } from "@/server/storage/s3";
import { isStreamable } from "@/server/storage/types";
import { getAsset, UUID_PATTERN } from "@/server/video-uploads/service";

type Context = RouteContext<"/media/[id]">;

const MAX_OPEN_RANGE_BYTES = 4 * 1024 * 1024;

const notFound = () => new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });

/**
 * Serves an uploaded video — only while its QR code exists and is active, so pausing or
 * deleting a code also stops the video. Local files are streamed with HTTP range support;
 * object-storage files are served via a short-lived presigned redirect.
 */
async function serve(request: Request, context: Context, headOnly: boolean): Promise<Response> {
  const { id } = await context.params;
  if (!UUID_PATTERN.test(id)) return notFound();

  let asset;
  try {
    const db = await getDb();
    asset = await getAsset(db, id);
    if (!asset || !(await isAssetServable(db, asset))) return notFound();
  } catch (error) {
    console.error("Media lookup failed", error);
    return new Response("Temporarily unavailable", { status: 503, headers: { "Retry-After": "30" } });
  }

  const storage = getVideoStorageOrNull();
  if (storage instanceof S3VideoStorage) {
    return new Response(null, {
      status: 302,
      headers: { Location: await storage.presignDownload(asset.storageKey), "Cache-Control": "no-store" },
    });
  }
  if (!isStreamable(storage)) return notFound();

  const size = await storage.size(asset.storageKey);
  if (size === null) return notFound();

  const baseHeaders: Record<string, string> = {
    "Content-Type": asset.contentType,
    "Accept-Ranges": "bytes",
    // Short cache so pausing or deleting a code takes effect quickly.
    "Cache-Control": "private, max-age=300",
    "Content-Disposition": "inline",
    "X-Robots-Tag": "noindex",
  };

  const rangeHeader = request.headers.get("range");
  const range = parseRange(rangeHeader, size);
  if (range === "unsatisfiable") {
    return new Response(null, { status: 416, headers: { ...baseHeaders, "Content-Range": `bytes */${size}` } });
  }
  if (range) {
    // Database-backed videos: answer open-ended ranges ("bytes=N-") in bounded slices.
    // HTTP allows a shorter 206 response; players then request the next range. This keeps
    // each serverless invocation short instead of streaming a whole file at once.
    if (storage.driver === "mongodb" && /^bytes=\d+-$/.test(rangeHeader?.trim() ?? "")) {
      range.end = Math.min(range.end, range.start + MAX_OPEN_RANGE_BYTES - 1);
    }
    const length = range.end - range.start + 1;
    return new Response(headOnly ? null : storage.stream(asset.storageKey, range.start, range.end), {
      status: 206,
      headers: { ...baseHeaders, "Content-Length": String(length), "Content-Range": `bytes ${range.start}-${range.end}/${size}` },
    });
  }
  return new Response(headOnly || size === 0 ? null : storage.stream(asset.storageKey, 0, size - 1), {
    status: 200,
    headers: { ...baseHeaders, "Content-Length": String(size) },
  });
}

export function GET(request: Request, context: Context) {
  return serve(request, context, false);
}

export function HEAD(request: Request, context: Context) {
  return serve(request, context, true);
}
