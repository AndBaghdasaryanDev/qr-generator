import { Binary, MongoServerError } from "mongodb";
import type { Database } from "@/server/db/client";
import { StorageError, type UploadTarget, type VideoStorage } from "./types";

/** GridFS chunk size (the GridFS default is 255 KiB; a power of two keeps the math simple). */
export const GRIDFS_CHUNK_BYTES = 256 * 1024;
/**
 * Size of each upload request. Must stay below serverless request-body limits
 * (Vercel: 4.5 MB) and be a whole number of GridFS chunks.
 */
export const UPLOAD_PIECE_BYTES = 16 * GRIDFS_CHUNK_BYTES;

export class DuplicatePieceError extends Error {}

/**
 * Stores videos inside MongoDB using the standard GridFS layout (`videos.files` /
 * `videos.chunks`), so no separate object storage is needed. Uploads arrive in 4 MiB
 * pieces; playback streams chunks back with byte-range support.
 *
 * Trade-off: every byte is stored in and served from the database, which counts against
 * the cluster's storage (512 MB on Atlas M0) and goes through the app server on every view.
 */
export class MongoVideoStorage implements VideoStorage {
  readonly driver = "mongodb" as const;

  constructor(private readonly getDb: () => Promise<Database>) {}

  async createUploadTarget(_key: string, _contentType: string, localUploadUrl: string): Promise<UploadTarget> {
    return {
      url: localUploadUrl,
      method: "PUT",
      headers: { "Content-Type": "application/octet-stream" },
      chunkSize: UPLOAD_PIECE_BYTES,
    };
  }

  /** Writes one upload piece starting at `offset` (a multiple of UPLOAD_PIECE_BYTES). */
  async writePiece(key: string, offset: number, bytes: Uint8Array): Promise<void> {
    if (offset % UPLOAD_PIECE_BYTES !== 0) throw new StorageError("Upload pieces must be aligned.");
    const db = await this.getDb();
    const first = offset / GRIDFS_CHUNK_BYTES;
    const docs = [];
    for (let i = 0; i * GRIDFS_CHUNK_BYTES < bytes.length; i++) {
      const slice = bytes.subarray(i * GRIDFS_CHUNK_BYTES, (i + 1) * GRIDFS_CHUNK_BYTES);
      docs.push({ files_id: key, n: first + i, data: new Binary(Buffer.from(slice)) });
    }
    try {
      await db.videoChunks.insertMany(docs, { ordered: true });
    } catch (error) {
      if (error instanceof MongoServerError && error.code === 11000) throw new DuplicatePieceError("This piece was already uploaded.");
      throw error;
    }
  }

  /** Creates the file record once every piece has arrived, making the file readable. */
  async finalize(key: string, length: number, contentType: string): Promise<void> {
    const db = await this.getDb();
    await db.videoFiles.insertOne({
      _id: key,
      length,
      chunkSize: GRIDFS_CHUNK_BYTES,
      uploadDate: new Date(),
      filename: key,
      metadata: { contentType },
    });
  }

  async size(key: string): Promise<number | null> {
    const db = await this.getDb();
    const file = await db.videoFiles.findOne({ _id: key });
    return file ? file.length : null;
  }

  async readHead(key: string, length: number): Promise<Uint8Array> {
    const db = await this.getDb();
    const chunk = await db.videoChunks.findOne({ files_id: key, n: 0 });
    return chunk ? chunk.data.buffer.subarray(0, Math.min(length, chunk.data.length())) : new Uint8Array(0);
  }

  async delete(key: string): Promise<void> {
    const db = await this.getDb();
    await db.videoChunks.deleteMany({ files_id: key });
    await db.videoFiles.deleteOne({ _id: key });
  }

  /** Streams bytes start..end (inclusive), reading only the chunks that overlap the range. */
  stream(key: string, start: number, end: number): ReadableStream<Uint8Array> {
    const firstChunk = Math.floor(start / GRIDFS_CHUNK_BYTES);
    const lastChunk = Math.floor(end / GRIDFS_CHUNK_BYTES);
    let cursor: ReturnType<Database["videoChunks"]["find"]> | null = null;

    return new ReadableStream<Uint8Array>({
      pull: async (controller) => {
        if (!cursor) {
          const db = await this.getDb();
          cursor = db.videoChunks.find({ files_id: key, n: { $gte: firstChunk, $lte: lastChunk } }).sort({ n: 1 });
        }
        const chunk = await cursor.next();
        if (!chunk) {
          await cursor.close();
          controller.close();
          return;
        }
        const data = chunk.data.buffer.subarray(0, chunk.data.length());
        const chunkStart = chunk.n * GRIDFS_CHUNK_BYTES;
        const from = Math.max(0, start - chunkStart);
        const to = Math.min(data.length, end - chunkStart + 1);
        controller.enqueue(data.subarray(from, to));
      },
      cancel: async () => {
        await cursor?.close();
      },
    });
  }
}
