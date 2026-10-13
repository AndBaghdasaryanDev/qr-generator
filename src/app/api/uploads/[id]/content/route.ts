import { getDb } from "@/server/db/client";
import { handleError, json, uploadTokenFrom } from "@/server/http";
import { getVideoStorage } from "@/server/storage/config";
import { MongoVideoStorage } from "@/server/storage/mongodb";
import { authorizeUpload, receiveLocalUpload, receiveUploadPiece } from "@/server/video-uploads/service";

/**
 * Receives file bytes for drivers that store through the app:
 * - local disk: the whole file in one streamed request (cut off past the declared size);
 * - MongoDB: one 4 MiB piece per request, `?offset=` giving its position, in order.
 */
export async function PUT(request: Request, context: RouteContext<"/api/uploads/[id]/content">): Promise<Response> {
  try {
    const { id } = await context.params;
    const db = await getDb();
    const asset = await authorizeUpload(db, id, uploadTokenFrom(request));
    const storage = getVideoStorage();
    if (storage instanceof MongoVideoStorage) {
      const offset = Number(new URL(request.url).searchParams.get("offset") ?? "NaN");
      return json(await receiveUploadPiece(db, storage, asset, offset, request.body));
    }
    await receiveLocalUpload(db, storage, asset, request.body);
    return json({ ok: true });
  } catch (error) {
    return handleError(error);
  }
}
