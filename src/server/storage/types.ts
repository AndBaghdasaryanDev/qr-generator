export interface UploadTarget {
  url: string;
  method: "PUT";
  headers: Record<string, string>;
}

export interface VideoStorage {
  readonly driver: "local" | "s3";
  /** Where the browser should PUT the file. `localUploadUrl` is used by the local driver. */
  createUploadTarget(key: string, contentType: string, localUploadUrl: string): Promise<UploadTarget>;
  /** Size of a stored object, or null if it doesn't exist. */
  size(key: string): Promise<number | null>;
  /** First `length` bytes of a stored object (for file-type verification). */
  readHead(key: string, length: number): Promise<Uint8Array>;
  delete(key: string): Promise<void>;
}

export class StorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StorageError";
  }
}
