import { createServer, type Server } from "node:http";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { POST as takedown } from "@/app/api/admin/takedown/route";
import { DELETE, GET as getQr, PATCH } from "@/app/api/qr-codes/[code]/route";
import { POST as createQr } from "@/app/api/qr-codes/route";
import { POST as complete } from "@/app/api/uploads/[id]/complete/route";
import { PUT as putContent } from "@/app/api/uploads/[id]/content/route";
import { POST as reserve } from "@/app/api/uploads/route";
import { GET as media, HEAD as mediaHead } from "@/app/media/[id]/route";
import { GET as resolve } from "@/app/r/[code]/route";
import { sniffVideoType } from "@/lib/video/file-type";
import { getDb } from "@/server/db/client";
import { startTestMongo } from "../helpers/mongo";
import { parseRange } from "@/server/range";
import { S3VideoStorage } from "@/server/storage/s3";
import { cleanupStaleUploads, completeUpload, createUpload, getAsset, sanitizeFileName } from "@/server/video-uploads/service";

const ORIGIN = "https://qr.test";
let storageDir: string;

/** A minimal ISO-BMFF header ("ftyp" box) followed by filler — enough for type detection. */
function fakeMp4(size: number, brand = "isom"): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(size);
  bytes.set([0, 0, 0, 0x18], 0);
  bytes.set(new TextEncoder().encode(`ftyp${brand}`), 4);
  for (let i = 12; i < size; i++) bytes[i] = i % 251;
  return bytes;
}

function json(method: string, url: string, body?: unknown, headers: Record<string, string> = {}) {
  return new Request(url, {
    method,
    headers: { "x-forwarded-for": `198.51.100.${Math.floor(Math.random() * 200)}`, ...(body ? { "content-type": "application/json" } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
}
const params = <K extends string>(key: K, value: string) => ({ params: Promise.resolve({ [key]: value } as Record<K, string>) });

interface Reserved {
  uploadId: string;
  uploadToken: string;
  target: { url: string; method: string };
}

async function uploadVideo(bytes: Uint8Array<ArrayBuffer>, contentType = "video/mp4", fileName = "clip.mp4"): Promise<Reserved> {
  const res = await reserve(json("POST", `${ORIGIN}/api/uploads`, { fileName, sizeBytes: bytes.length, contentType }));
  expect(res.status).toBe(201);
  const reserved = (await res.json()) as Reserved;
  expect(reserved.target.url).toBe(`/api/uploads/${reserved.uploadId}/content`);
  const put = await putContent(
    new Request(`${ORIGIN}${reserved.target.url}`, { method: "PUT", body: bytes, headers: { "x-upload-token": reserved.uploadToken } }),
    params("id", reserved.uploadId),
  );
  expect(put.status).toBe(200);
  const done = await complete(
    new Request(`${ORIGIN}/api/uploads/${reserved.uploadId}/complete`, { method: "POST", headers: { "x-upload-token": reserved.uploadToken } }),
    params("id", reserved.uploadId),
  );
  expect(done.status).toBe(200);
  return reserved;
}

interface Created {
  qr: { code: string; destinationUrl: string; presentation: string; source: { kind: string; fileName?: string } };
  manageToken: string;
}

async function createUploadQr(reserved: Reserved): Promise<Created> {
  const res = await createQr(
    json("POST", `${ORIGIN}/api/qr-codes`, { qrType: "video", name: "Promo", upload: { id: reserved.uploadId, token: reserved.uploadToken } }),
  );
  expect(res.status).toBe(201);
  return (await res.json()) as Created;
}

const storedFiles = async () => (await readdir(storageDir).catch(() => [])).filter((f) => !f.endsWith(".part"));

beforeAll(async () => {
  storageDir = await mkdtemp(path.join(tmpdir(), "qr-videos-"));
  process.env.VIDEO_UPLOAD_DRIVER = "local";
  process.env.VIDEO_STORAGE_DIR = storageDir;
  process.env.VIDEO_MAX_UPLOAD_MB = "1";
  await startTestMongo();
});

beforeEach(() => {
  process.env.VIDEO_UPLOAD_DRIVER = "local";
  delete process.env.VIDEO_STORAGE_QUOTA_GB;
});

afterAll(async () => {
  await rm(storageDir, { recursive: true, force: true });
});

describe("helpers", () => {
  it("sniffs video types from magic bytes", () => {
    expect(sniffVideoType(fakeMp4(32))?.contentType).toBe("video/mp4");
    expect(sniffVideoType(fakeMp4(32, "qt  "))?.contentType).toBe("video/quicktime");
    expect(sniffVideoType(new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0, 0]))?.contentType).toBe("video/webm");
    expect(sniffVideoType(new TextEncoder().encode("<svg onload=alert(1)>"))).toBeNull();
  });
  it("parses byte ranges", () => {
    expect(parseRange("bytes=0-9", 100)).toEqual({ start: 0, end: 9 });
    expect(parseRange("bytes=90-", 100)).toEqual({ start: 90, end: 99 });
    expect(parseRange("bytes=-10", 100)).toEqual({ start: 90, end: 99 });
    expect(parseRange("bytes=50-500", 100)).toEqual({ start: 50, end: 99 });
    expect(parseRange("bytes=100-", 100)).toBe("unsatisfiable");
    expect(parseRange("bytes=0-1,5-6", 100)).toBeNull();
    expect(parseRange(null, 100)).toBeNull();
  });
  it("sanitizes display file names", () => {
    expect(sanitizeFileName("../../etc/passwd")).toBe("passwd");
    expect(sanitizeFileName('C:\\Users\\me\\Տեսանյութ "1".mp4')).toBe("Տեսանյութ 1.mp4");
    expect(sanitizeFileName("\u0000")).toBe("video");
  });
});

describe("upload → QR → scan → watch", () => {
  it("serves an uploaded video through its dynamic code, with range support", async () => {
    const bytes = fakeMp4(4096);
    const reserved = await uploadVideo(bytes, "video/mp4", "Իմ տեսանյութը.mp4");
    const { qr } = await createUploadQr(reserved);
    expect(qr.source).toEqual({ kind: "upload", fileName: "Իմ տեսանյութը.mp4", sizeBytes: 4096, contentType: "video/mp4" });
    expect(qr.presentation).toBe("player");
    expect(qr.destinationUrl).toBe(`${ORIGIN}/media/${reserved.uploadId}`);

    const scan = await resolve(new Request(`${ORIGIN}/r/${qr.code}`), params("code", qr.code));
    expect(scan.status).toBe(302);
    expect(scan.headers.get("location")).toBe(`${ORIGIN}/watch/${qr.code}`);

    const full = await media(new Request(`${ORIGIN}/media/${reserved.uploadId}`), params("id", reserved.uploadId));
    expect(full.status).toBe(200);
    expect(full.headers.get("content-type")).toBe("video/mp4");
    expect(full.headers.get("accept-ranges")).toBe("bytes");
    expect(new Uint8Array(await full.arrayBuffer())).toEqual(bytes);

    const partial = await media(
      new Request(`${ORIGIN}/media/${reserved.uploadId}`, { headers: { range: "bytes=100-199" } }),
      params("id", reserved.uploadId),
    );
    expect(partial.status).toBe(206);
    expect(partial.headers.get("content-range")).toBe("bytes 100-199/4096");
    expect(new Uint8Array(await partial.arrayBuffer())).toEqual(bytes.subarray(100, 200));

    const bad = await media(new Request(`${ORIGIN}/media/${reserved.uploadId}`, { headers: { range: "bytes=5000-" } }), params("id", reserved.uploadId));
    expect(bad.status).toBe(416);

    const head = await mediaHead(new Request(`${ORIGIN}/media/${reserved.uploadId}`, { method: "HEAD" }), params("id", reserved.uploadId));
    expect(head.headers.get("content-length")).toBe("4096");
  });

  it("redirect presentation sends scanners straight to the file", async () => {
    const reserved = await uploadVideo(fakeMp4(512));
    const res = await createQr(
      json("POST", `${ORIGIN}/api/qr-codes`, {
        qrType: "video",
        presentation: "redirect",
        upload: { id: reserved.uploadId, token: reserved.uploadToken },
      }),
    );
    const { qr } = (await res.json()) as Created;
    const scan = await resolve(new Request(`${ORIGIN}/r/${qr.code}`), params("code", qr.code));
    expect(scan.headers.get("location")).toBe(`${ORIGIN}/media/${reserved.uploadId}`);
  });

  it("does not serve uploads that aren't attached to a code", async () => {
    const reserved = await uploadVideo(fakeMp4(256));
    const res = await media(new Request(`${ORIGIN}/media/${reserved.uploadId}`), params("id", reserved.uploadId));
    expect(res.status).toBe(404);
  });
});

describe("upload validation", () => {
  it("rejects files that aren't videos, even with a video MIME type", async () => {
    const fake = new Uint8Array(new TextEncoder().encode("<html><script>alert(1)</script></html>".padEnd(64, " ")));
    const res = await reserve(json("POST", `${ORIGIN}/api/uploads`, { fileName: "x.mp4", sizeBytes: fake.length, contentType: "video/mp4" }));
    const reserved = (await res.json()) as Reserved;
    const put = await putContent(
      new Request(`${ORIGIN}${reserved.target.url}`, { method: "PUT", body: fake, headers: { "x-upload-token": reserved.uploadToken } }),
      params("id", reserved.uploadId),
    );
    expect(put.status).toBe(400);
    expect(await storedFiles()).not.toContain(`${reserved.uploadId}.mp4`);
  });

  it("rejects bodies larger than declared and declared sizes over the limit", async () => {
    const res = await reserve(json("POST", `${ORIGIN}/api/uploads`, { fileName: "x.mp4", sizeBytes: 100, contentType: "video/mp4" }));
    const reserved = (await res.json()) as Reserved;
    const put = await putContent(
      new Request(`${ORIGIN}${reserved.target.url}`, { method: "PUT", body: fakeMp4(5000), headers: { "x-upload-token": reserved.uploadToken } }),
      params("id", reserved.uploadId),
    );
    expect(put.status).toBe(400);

    const tooBig = await reserve(json("POST", `${ORIGIN}/api/uploads`, { fileName: "big.mp4", sizeBytes: 2 * 1024 * 1024, contentType: "video/mp4" }));
    expect(tooBig.status).toBe(400);
    expect(await tooBig.json()).toMatchObject({ error: { field: "sizeBytes" } });

    const wrongType = await reserve(json("POST", `${ORIGIN}/api/uploads`, { fileName: "a.svg", sizeBytes: 10, contentType: "image/svg+xml" }));
    expect(wrongType.status).toBe(400);
  });

  it("requires the upload token", async () => {
    const res = await reserve(json("POST", `${ORIGIN}/api/uploads`, { fileName: "x.mp4", sizeBytes: 64, contentType: "video/mp4" }));
    const reserved = (await res.json()) as Reserved;
    const put = await putContent(
      new Request(`${ORIGIN}${reserved.target.url}`, { method: "PUT", body: fakeMp4(64), headers: { "x-upload-token": "A".repeat(43) } }),
      params("id", reserved.uploadId),
    );
    expect(put.status).toBe(403);
    const steal = await createQr(json("POST", `${ORIGIN}/api/qr-codes`, { qrType: "video", upload: { id: reserved.uploadId, token: "A".repeat(43) } }));
    expect(steal.status).toBe(403);
  });

  it("won't attach the same upload to two codes, or to non-video codes", async () => {
    const reserved = await uploadVideo(fakeMp4(300));
    await createUploadQr(reserved);
    const again = await createQr(json("POST", `${ORIGIN}/api/qr-codes`, { qrType: "video", upload: { id: reserved.uploadId, token: reserved.uploadToken } }));
    expect(again.status).toBe(400);
    const other = await uploadVideo(fakeMp4(300));
    const wrongType = await createQr(json("POST", `${ORIGIN}/api/qr-codes`, { qrType: "url", upload: { id: other.uploadId, token: other.uploadToken } }));
    expect(wrongType.status).toBe(400);
  });

  it("lets only one of two simultaneous requests attach the same upload", async () => {
    const reserved = await uploadVideo(fakeMp4(300));
    const body = { qrType: "video", upload: { id: reserved.uploadId, token: reserved.uploadToken } };
    const results = await Promise.all([
      createQr(json("POST", `${ORIGIN}/api/qr-codes`, body)),
      createQr(json("POST", `${ORIGIN}/api/qr-codes`, body)),
      createQr(json("POST", `${ORIGIN}/api/qr-codes`, body)),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 400, 400]);
  });

  it("enforces the storage quota", async () => {
    process.env.VIDEO_STORAGE_QUOTA_GB = String(1 / 1024 / 1024); // ≈ 1 KB
    const res = await reserve(json("POST", `${ORIGIN}/api/uploads`, { fileName: "x.mp4", sizeBytes: 900_000, contentType: "video/mp4" }));
    expect(res.status).toBe(507);
  });

  it("reports disabled uploads clearly", async () => {
    process.env.VIDEO_UPLOAD_DRIVER = "disabled";
    const res = await reserve(json("POST", `${ORIGIN}/api/uploads`, { fileName: "x.mp4", sizeBytes: 10, contentType: "video/mp4" }));
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ error: { code: "uploads_disabled" } });
  });
});

describe("lifecycle: pause, replace, switch to link, delete", () => {
  it("stops serving when paused and removes replaced files from storage", async () => {
    const first = await uploadVideo(fakeMp4(700));
    const { qr, manageToken } = await createUploadQr(first);
    const auth = { authorization: `Bearer ${manageToken}` };
    const mediaStatus = async (id: string) => (await media(new Request(`${ORIGIN}/media/${id}`), params("id", id))).status;

    await PATCH(json("PATCH", `${ORIGIN}/api/qr-codes/${qr.code}`, { isActive: false }, auth), params("code", qr.code));
    expect(await mediaStatus(first.uploadId)).toBe(404);
    await PATCH(json("PATCH", `${ORIGIN}/api/qr-codes/${qr.code}`, { isActive: true }, auth), params("code", qr.code));
    expect(await mediaStatus(first.uploadId)).toBe(200);

    // Replace the video: same printed code, new file, old file deleted.
    const second = await uploadVideo(fakeMp4(800, "qt  "), "video/quicktime", "new.mov");
    const replaced = await PATCH(
      json("PATCH", `${ORIGIN}/api/qr-codes/${qr.code}`, { upload: { id: second.uploadId, token: second.uploadToken } }, auth),
      params("code", qr.code),
    );
    const replacedBody = (await replaced.json()) as Created;
    expect(replacedBody.qr.code).toBe(qr.code);
    expect(replacedBody.qr.source).toMatchObject({ kind: "upload", fileName: "new.mov" });
    expect(await mediaStatus(first.uploadId)).toBe(404);
    expect(await mediaStatus(second.uploadId)).toBe(200);
    expect(await storedFiles()).not.toContain(`${first.uploadId}.mp4`);

    // Switch to an external link: the uploaded file is removed.
    const switched = await PATCH(
      json("PATCH", `${ORIGIN}/api/qr-codes/${qr.code}`, { destinationUrl: "https://youtu.be/dQw4w9WgXcQ" }, auth),
      params("code", qr.code),
    );
    const switchedBody = (await switched.json()) as Created;
    expect(switchedBody.qr.source).toEqual({ kind: "link" });
    expect(switchedBody.qr.presentation).toBe("redirect");
    expect(await storedFiles()).not.toContain(`${second.uploadId}.mov`);
    const scan = await resolve(new Request(`${ORIGIN}/r/${qr.code}`), params("code", qr.code));
    expect(scan.headers.get("location")).toBe("https://youtu.be/dQw4w9WgXcQ");
  });

  it("deleting a code deletes its video", async () => {
    const reserved = await uploadVideo(fakeMp4(400));
    const { qr, manageToken } = await createUploadQr(reserved);
    expect(await storedFiles()).toContain(`${reserved.uploadId}.mp4`);
    const res = await DELETE(json("DELETE", `${ORIGIN}/api/qr-codes/${qr.code}`, undefined, { authorization: `Bearer ${manageToken}` }), params("code", qr.code));
    expect(res.status).toBe(204);
    expect(await storedFiles()).not.toContain(`${reserved.uploadId}.mp4`);
    expect((await getAsset(await getDb(), reserved.uploadId))?.status).toBe("deleted");
  });

  it("owner view includes upload info", async () => {
    const reserved = await uploadVideo(fakeMp4(333), "video/mp4", "talk.mp4");
    const { qr, manageToken } = await createUploadQr(reserved);
    const res = await getQr(json("GET", `${ORIGIN}/api/qr-codes/${qr.code}`, undefined, { authorization: `Bearer ${manageToken}` }), params("code", qr.code));
    expect(((await res.json()) as Created).qr.source).toMatchObject({ kind: "upload", fileName: "talk.mp4", sizeBytes: 333 });
  });
});

describe("housekeeping and moderation", () => {
  it("removes abandoned uploads after 24 hours", async () => {
    const res = await reserve(json("POST", `${ORIGIN}/api/uploads`, { fileName: "x.mp4", sizeBytes: 64, contentType: "video/mp4" }));
    const pending = (await res.json()) as Reserved;
    const unattached = await uploadVideo(fakeMp4(128));
    const storage = new (await import("@/server/storage/local")).LocalVideoStorage(storageDir);
    await cleanupStaleUploads(await getDb(), storage, Date.now() + 25 * 60 * 60 * 1000);
    expect((await getAsset(await getDb(), pending.uploadId))?.status).toBe("deleted");
    expect((await getAsset(await getDb(), unattached.uploadId))?.status).toBe("deleted");
    expect(await storedFiles()).not.toContain(`${unattached.uploadId}.mp4`);
  });

  it("admin takedown requires the admin token and removes code and video", async () => {
    const reserved = await uploadVideo(fakeMp4(200));
    const { qr } = await createUploadQr(reserved);
    process.env.ADMIN_TOKEN = "t".repeat(40);
    const denied = await takedown(json("POST", `${ORIGIN}/api/admin/takedown`, { code: qr.code }, { authorization: "Bearer wrong" }));
    expect(denied.status).toBe(403);
    const ok = await takedown(json("POST", `${ORIGIN}/api/admin/takedown`, { code: qr.code }, { authorization: `Bearer ${"t".repeat(40)}` }));
    expect(ok.status).toBe(200);
    const scan = await resolve(new Request(`${ORIGIN}/r/${qr.code}`), params("code", qr.code));
    expect(scan.status).toBe(410);
    expect(await storedFiles()).not.toContain(`${reserved.uploadId}.mp4`);
    delete process.env.ADMIN_TOKEN;
  });
});

describe("S3-compatible driver (against an in-process fake S3)", () => {
  let server: Server;
  let endpoint: string;
  const objects = new Map<string, Buffer>();
  const seen: string[] = [];

  beforeAll(async () => {
    server = createServer((req, res) => {
      const url = new URL(req.url ?? "/", "http://x");
      seen.push(`${req.method} ${url.pathname} signed=${url.searchParams.has("X-Amz-Signature") || Boolean(req.headers.authorization)}`);
      const key = url.pathname;
      if (req.method === "PUT") {
        const chunks: Buffer[] = [];
        req.on("data", (c: Buffer) => chunks.push(c));
        req.on("end", () => {
          objects.set(key, Buffer.concat(chunks));
          res.writeHead(200).end();
        });
        return;
      }
      const body = objects.get(key);
      if (!body) return void res.writeHead(404).end();
      if (req.method === "HEAD") return void res.writeHead(200, { "Content-Length": body.length }).end();
      if (req.method === "DELETE") {
        objects.delete(key);
        return void res.writeHead(204).end();
      }
      const range = /bytes=(\d+)-(\d+)/.exec(String(req.headers.range ?? ""));
      if (range) return void res.writeHead(206).end(body.subarray(Number(range[1]), Number(range[2]) + 1));
      res.writeHead(200).end(body);
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  it("presigns uploads, verifies size and type on completion, and deletes bad files", async () => {
    const storage = new S3VideoStorage({ endpoint, bucket: "videos-bucket", region: "auto", accessKeyId: "AKIDEXAMPLE", secretAccessKey: "secret" });
    const config = { driver: "s3" as const, maxBytes: 1024 * 1024, quotaBytes: 1024 * 1024 * 1024 };
    const db = await getDb();

    const good = fakeMp4(2048);
    const reserved = await createUpload(db, storage, config, { fileName: "a.mp4", sizeBytes: good.length, contentType: "video/mp4" }, () => "unused");
    const target = new URL(reserved.target.url);
    expect(target.origin).toBe(endpoint);
    expect(target.pathname).toBe(`/videos-bucket/videos/${reserved.uploadId}.mp4`);
    expect(target.searchParams.get("X-Amz-Expires")).toBe("900");
    expect(target.searchParams.get("X-Amz-Signature")).toMatch(/^[0-9a-f]{64}$/);
    await fetch(reserved.target.url, { method: "PUT", body: good });
    await completeUpload(db, storage, config, (await getAsset(db, reserved.uploadId))!);
    expect((await getAsset(db, reserved.uploadId))?.status).toBe("ready");

    const download = new URL(await storage.presignDownload(`videos/${reserved.uploadId}.mp4`));
    expect(download.searchParams.get("X-Amz-Expires")).toBe("3600");

    // A file whose bytes aren't a video is rejected and removed from the bucket.
    const bad = new Uint8Array(new TextEncoder().encode("not a video at all, just text...."));
    const badReserved = await createUpload(db, storage, config, { fileName: "b.mp4", sizeBytes: bad.length, contentType: "video/mp4" }, () => "unused");
    await fetch(badReserved.target.url, { method: "PUT", body: bad });
    await expect(completeUpload(db, storage, config, (await getAsset(db, badReserved.uploadId))!)).rejects.toThrow(/valid MP4/);
    expect(objects.has(`/videos-bucket/videos/${badReserved.uploadId}.mp4`)).toBe(false);

    // Server-side calls (HEAD/GET/DELETE) are signed with Authorization headers.
    expect(seen.filter((s) => !s.startsWith("PUT")).every((s) => s.endsWith("signed=true"))).toBe(true);
  });
});
