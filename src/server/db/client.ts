import "server-only";
import { MongoClient, type Collection } from "mongodb";
import type { GridFsChunkDoc, GridFsFileDoc, QrCodeDoc, VideoAssetDoc } from "./types";

export interface Database {
  qrCodes: Collection<QrCodeDoc>;
  videoAssets: Collection<VideoAssetDoc>;
  /** GridFS-layout collections holding uploaded video bytes (MongoDB storage driver). */
  videoFiles: Collection<GridFsFileDoc>;
  videoChunks: Collection<GridFsChunkDoc>;
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
    // The standard GridFS chunk index; unique, so a chunk can never be written twice.
    db.videoChunks.createIndex({ files_id: 1, n: 1 }, { name: "files_id_1_n_1", unique: true }),
  ]);
}

export function databaseFrom(client: MongoClient, dbName: string): Database {
  const db = client.db(dbName);
  return {
    qrCodes: db.collection<QrCodeDoc>("qr_codes"),
    videoAssets: db.collection<VideoAssetDoc>("video_assets"),
    videoFiles: db.collection<GridFsFileDoc>("videos.files"),
    videoChunks: db.collection<GridFsChunkDoc>("videos.chunks"),
  };
}

/*
 * One connection pool per process. On serverless platforms it survives between invocations
 * of a warm instance; in development it lives on globalThis so hot reloads reuse it.
 * Only the client is shared — collection handles and indexes are set up by the current
 * module instance, so code changes during development always take effect.
 */
const globalCache = globalThis as typeof globalThis & {
  __qrStudioMongoClient?: { uri: string; promise: Promise<MongoClient> };
};

function getClient(uri: string): Promise<MongoClient> {
  const cached = globalCache.__qrStudioMongoClient;
  if (cached && cached.uri === uri) return cached.promise;
  const promise = new MongoClient(uri, { appName: "qr-studio", maxPoolSize: 10, serverSelectionTimeoutMS: 8000 }).connect();
  // A failed connection must not be cached forever; the next request retries.
  promise.catch(() => {
    if (globalCache.__qrStudioMongoClient?.promise === promise) delete globalCache.__qrStudioMongoClient;
  });
  globalCache.__qrStudioMongoClient = { uri, promise };
  return promise;
}

let ready: { key: string; promise: Promise<Database> } | null = null;

export function getDb(): Promise<Database> {
  const uri = process.env.MONGODB_URI;
  if (!uri) return Promise.reject(new DatabaseNotConfiguredError());
  const dbName = process.env.MONGODB_DB || "qr_studio";
  const key = `${uri}|${dbName}`;
  if (ready?.key === key) return ready.promise;

  const promise = getClient(uri).then(async (client) => {
    const db = databaseFrom(client, dbName);
    await ensureIndexes(db);
    return db;
  });
  promise.catch(() => {
    if (ready?.promise === promise) ready = null;
  });
  ready = { key, promise };
  return promise;
}
