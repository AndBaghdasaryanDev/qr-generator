import { getDb } from "@/server/db/client";
import { handleError, json, uploadTokenFrom } from "@/server/http";
import { getVideoStorage, getVideoUploadConfig } from "@/server/storage/config";
import { authorizeUpload, completeUpload } from "@/server/video-uploads/service";

/** Confirms an upload; for object storage this verifies the stored size and file type. */
export async function POST(request: Request, context: RouteContext<"/api/uploads/[id]/complete">): Promise<Response> {
  try {
    const { id } = await context.params;
    const db = await getDb();
    const asset = await authorizeUpload(db, id, uploadTokenFrom(request));
    await completeUpload(db, getVideoStorage(), getVideoUploadConfig(), asset);
    return json({ ok: true });
  } catch (error) {
    return handleError(error);
  }
}
