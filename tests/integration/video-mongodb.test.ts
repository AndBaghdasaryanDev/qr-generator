import { beforeAll, describe, expect, it } from "vitest";
import { DELETE } from "@/app/api/qr-codes/[code]/route";
import { POST as createQr } from "@/app/api/qr-codes/route";
import { POST as complete } from "@/app/api/uploads/[id]/complete/route";
import { PUT as putContent } from "@/app/api/uploads/[id]/content/route";
import { POST as reserve } from "@/app/api/uploads/route";
import { GET as media } from "@/app/media/[id]/route";
import { getDb } from "@/server/db/client";
import { GRIDFS_CHUNK_BYTES, UPLOAD_PIECE_BYTES } from "@/server/storage/mongodb";
import { startTestMongo } from "../helpers/mongo";

const ORIGIN = "https://qr.test";
const PIECE = UPLOAD_PIECE_BYTES;

function fakeMp4(size: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(size);
  bytes.set([0, 0, 0, 0x18], 0);
  bytes.set(new TextEncoder().encode("ftypisom"), 4);
  for (let i = 12; i < size; i++) bytes[i] = (i * 7) % 251;
  return bytes;
}

const params = <K extends string>(key: K, value: string) => ({ params: Promise.resolve({ [key]: value } as Record<K, string>) });

function json(method: string, url: string, body?: unknown, headers: Record<string, string> = {}) {
  return new Request(url, {
    method,
    headers: { "x-forwarded-for": "192.0.2.10", ...(body ? { "content-type": "application/json" } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
}

interface Reserved {
  uploadId: string;
  uploadToken: string;
  target: { url: string; chunkSize?: number; headers: Record<string, string> };
}

async function reserveFor(size: number): Promise<Reserved> {
  const res = await reserve(json("POST", `${ORIGIN}/api/uploads`, { fileName: "clip.mp4", sizeBytes: size, contentType: "video/mp4" }));
  expect(res.status).toBe(201);
  return (await res.json()) as Reserved;
}

/** Sends a piece exactly as instructed by the server (url + headers), like the browser does. */
function putPiece(r: Reserved, offset: number, body: Uint8Array<ArrayBuffer>) {
  return putContent(
    new Request(`${ORIGIN}${r.target.url}?offset=${offset}`, { method: "PUT", body, headers: r.target.headers }),
    params("id", r.uploadId),
  );
}

async function uploadAll(bytes: Uint8Array<ArrayBuffer>): Promise<Reserved> {
  const r = await reserveFor(bytes.length);
  for (let offset = 0; offset < bytes.length; offset += PIECE) {
    const res = await putPiece(r, offset, bytes.slice(offset, offset + PIECE));
    expect(res.status).toBe(200);
  }
  const done = await complete(
    new Request(`${ORIGIN}/api/uploads/${r.uploadId}/complete`, { method: "POST", headers: { "x-upload-token": r.uploadToken } }),
    params("id", r.uploadId),
  );
  expect(done.status).toBe(200);
  return r;
}

const getMedia = (id: string, range?: string) =>
  media(new Request(`${ORIGIN}/media/${id}`, { headers: range ? { range } : {} }), params("id", id));

beforeAll(async () => {
  await startTestMongo();
  process.env.VIDEO_UPLOAD_DRIVER = "mongodb";
  delete process.env.VIDEO_MAX_UPLOAD_MB;
});

describe("videos stored in MongoDB (GridFS layout)", () => {
  it("asks the browser for 4 MiB pieces and uses a 50 MB default limit", async () => {
    const r = await reserveFor(1000);
    expect(r.target.chunkSize).toBe(4 * 1024 * 1024);
    expect(r.target.url).toBe(`/api/uploads/${r.uploadId}/content`);
    const tooBig = await reserve(json("POST", `${ORIGIN}/api/uploads`, { fileName: "x.mp4", sizeBytes: 51 * 1024 * 1024, contentType: "video/mp4" }));
    expect(tooBig.status).toBe(400);
  });

  it("stores a multi-piece upload and serves exact bytes and ranges across chunk boundaries", async () => {
    const bytes = fakeMp4(2 * PIECE + 12_345);
    const r = await uploadAll(bytes);
    const db = await getDb();
    expect(await db.videoChunks.countDocuments({ files_id: `videos/${r.uploadId}.mp4` })).toBe(Math.ceil(bytes.length / GRIDFS_CHUNK_BYTES));

    const created = await createQr(json("POST", `${ORIGIN}/api/qr-codes`, { qrType: "video", upload: { id: r.uploadId, token: r.uploadToken } }));
    expect(created.status).toBe(201);
    const { qr, manageToken } = (await created.json()) as { qr: { code: string }; manageToken: string };

    const full = await getMedia(r.uploadId);
    expect(full.status).toBe(200);
    expect(Buffer.compare(Buffer.from(await full.arrayBuffer()), bytes)).toBe(0);

    for (const [start, end] of [
      [GRIDFS_CHUNK_BYTES - 50, GRIDFS_CHUNK_BYTES + 50],
      [PIECE - 10, PIECE + 10],
      [bytes.length - 100, bytes.length - 1],
    ]) {
      const part = await getMedia(r.uploadId, `bytes=${start}-${end}`);
      expect(part.status).toBe(206);
      expect(Buffer.compare(Buffer.from(await part.arrayBuffer()), bytes.subarray(start, end + 1))).toBe(0);
    }

    // Open-ended ranges are answered in bounded slices.
    const open = await getMedia(r.uploadId, "bytes=0-");
    expect(open.headers.get("content-range")).toBe(`bytes 0-${4 * 1024 * 1024 - 1}/${bytes.length}`);
    expect((await open.arrayBuffer()).byteLength).toBe(4 * 1024 * 1024);

    // Deleting the code removes every stored byte.
    await DELETE(json("DELETE", `${ORIGIN}/api/qr-codes/${qr.code}`, undefined, { authorization: `Bearer ${manageToken}` }), params("code", qr.code));
    expect(await db.videoChunks.countDocuments({ files_id: `videos/${r.uploadId}.mp4` })).toBe(0);
    expect(await db.videoFiles.countDocuments({ _id: `videos/${r.uploadId}.mp4` })).toBe(0);
    expect((await getMedia(r.uploadId)).status).toBe(404);
  });

  it("requires pieces in order, at the right size, without duplicates", async () => {
    const bytes = fakeMp4(PIECE + 500);
    const r = await reserveFor(bytes.length);
    expect((await putPiece(r, PIECE, bytes.slice(PIECE))).status).toBe(409); // skipped the first piece
    expect((await putPiece(r, 0, bytes.slice(0, 1000))).status).toBe(400); // short non-final piece
    expect((await putPiece(r, 0, fakeMp4(PIECE + 1))).status).toBe(400); // oversized piece
    expect((await putPiece(r, 0, bytes.slice(0, PIECE))).status).toBe(200);
    expect((await putPiece(r, 0, bytes.slice(0, PIECE))).status).toBe(409); // duplicate (e.g. a retry)
    expect((await putPiece(r, PIECE, bytes.slice(PIECE))).status).toBe(200);
  });

  it("rejects a non-video on the first piece and removes what was stored", async () => {
    const fake = new Uint8Array(new TextEncoder().encode("<html><script>alert(1)</script></html>".padEnd(2000, " ")));
    const r = await reserveFor(fake.length);
    expect((await putPiece(r, 0, fake)).status).toBe(400);
    const db = await getDb();
    expect(await db.videoChunks.countDocuments({ files_id: `videos/${r.uploadId}.mp4` })).toBe(0);
    expect((await db.videoAssets.findOne({ _id: r.uploadId }))?.status).toBe("deleted");
  });

  it("requires the upload token for pieces", async () => {
    const r = await reserveFor(100);
    const res = await putContent(
      new Request(`${ORIGIN}${r.target.url}?offset=0`, { method: "PUT", body: fakeMp4(100), headers: { "x-upload-token": "B".repeat(43) } }),
      params("id", r.uploadId),
    );
    expect(res.status).toBe(403);
  });
});
