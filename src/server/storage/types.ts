export interface UploadTarget {
  url: string;
  method: "PUT";
  headers: Record<string, string>;
  /**
   * When set, the file must be sent in pieces of this size (the last may be smaller),
   * each as `PUT {url}?offset={byteOffset}`, in order.
   */
  chunkSize?: number;
}

export interface VideoStorage {
  readonly driver: "local" | "s3" | "mongodb";
  /** Where the browser should PUT the file. `localUploadUrl` is used by the local driver. */
  createUploadTarget(key: string, contentType: string, localUploadUrl: string): Promise<UploadTarget>;
  /** Size of a stored object, or null if it doesn't exist. */
  size(key: string): Promise<number | null>;
  /** First `length` bytes of a stored object (for file-type verification). */
  readHead(key: string, length: number): Promise<Uint8Array>;
  delete(key: string): Promise<void>;
}

/** Drivers whose bytes are served by the app itself (rather than via a storage redirect). */
export interface StreamableVideoStorage extends VideoStorage {
  stream(key: string, start: number, end: number): ReadableStream<Uint8Array>;
}

export function isStreamable(storage: VideoStorage | null): storage is StreamableVideoStorage {
  return storage !== null && typeof (storage as Partial<StreamableVideoStorage>).stream === "function";
}

export class StorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StorageError";
  }
}
