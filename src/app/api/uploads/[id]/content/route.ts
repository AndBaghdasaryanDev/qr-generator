import { getDb } from "@/server/db/client";
import { handleError, json, uploadTokenFrom } from "@/server/http";
import { getVideoStorage } from "@/server/storage/config";
import { authorizeUpload, receiveLocalUpload } from "@/server/video-uploads/service";

/**
 * Receives the file body for the local-disk driver. It is streamed to disk (never fully
 * buffered) and cut off as soon as it exceeds the size declared when the upload was reserved.
 */
export async function PUT(request: Request, context: RouteContext<"/api/uploads/[id]/content">): Promise<Response> {
  try {
    const { id } = await context.params;
    const db = await getDb();
    const asset = await authorizeUpload(db, id, uploadTokenFrom(request));
    await receiveLocalUpload(db, getVideoStorage(), asset, request.body);
    return json({ ok: true });
  } catch (error) {
    return handleError(error);
  }
}
