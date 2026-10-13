import "server-only";
import { MongoClient, type Collection } from "mongodb";
import type { QrCodeDoc, VideoAssetDoc } from "./types";

export interface Database {
  qrCodes: Collection<QrCodeDoc>;
  videoAssets: Collection<VideoAssetDoc>;
}

export class DatabaseNotConfiguredError extends Error {
  constructor() {
    super("MONGODB_URI is not set. Dynamic QR codes are disabled until a database is configured.");
    this.name = "DatabaseNotConfiguredError";
  }
}

/** Creates the indexes the app relies on. Idempotent, so it is safe on every cold start. */
export async function ensureIndexes(db: Database): Promise<void> {
  await Promise.all([
    db.qrCodes.createIndexes([
      { key: { publicCode: 1 }, name: "publicCode_unique", unique: true },
      { key: { createdAt: 1 }, name: "createdAt" },
    ]),
    db.videoAssets.createIndexes([
      { key: { storageKey: 1 }, name: "storageKey_unique", unique: true },
      { key: { status: 1, createdAt: 1 }, name: "status_createdAt" },
      { key: { qrCodeId: 1 }, name: "qrCodeId" },
    ]),
  ]);
}

export function databaseFrom(client: MongoClient, dbName: string): Database {
  const db = client.db(dbName);
  return { qrCodes: db.collection<QrCodeDoc>("qr_codes"), videoAssets: db.collection<VideoAssetDoc>("video_assets") };
}

/*
 * One client per process. On serverless platforms the module (and this cache) survives
 * between invocations of a warm instance; in development globalThis survives hot reloads,
 * so we don't open a new connection pool on every file change.
 */
const globalCache = globalThis as typeof globalThis & {
  __qrStudioMongo?: { uri: string; promise: Promise<Database> };
};

export function getDb(): Promise<Database> {
  const uri = process.env.MONGODB_URI;
  if (!uri) return Promise.reject(new DatabaseNotConfiguredError());
  const cached = globalCache.__qrStudioMongo;
  if (cached && cached.uri === uri) return cached.promise;

  const promise = (async () => {
    const client = new MongoClient(uri, {
      appName: "qr-studio",
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 8000,
    });
    await client.connect();
    const db = databaseFrom(client, process.env.MONGODB_DB || "qr_studio");
    await ensureIndexes(db);
    return db;
  })();
  // A failed connection must not be cached forever; the next request retries.
  promise.catch(() => {
    if (globalCache.__qrStudioMongo?.promise === promise) delete globalCache.__qrStudioMongo;
  });
  globalCache.__qrStudioMongo = { uri, promise };
  return promise;
}
