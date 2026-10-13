import { AwsClient } from "aws4fetch";
import { StorageError, type UploadTarget, type VideoStorage } from "./types";

export interface S3Config {
  /** e.g. https://<account>.r2.cloudflarestorage.com, https://s3.eu-central-1.amazonaws.com, http://localhost:9000 */
  endpoint: string;
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
}

const UPLOAD_URL_TTL_SECONDS = 15 * 60;
export const DOWNLOAD_URL_TTL_SECONDS = 60 * 60;

/**
 * S3-compatible object storage (AWS S3, Cloudflare R2, MinIO, Backblaze B2…).
 * The bucket stays private: browsers upload with short-lived presigned PUT URLs and
 * viewers are redirected to short-lived presigned GET URLs, so pausing or deleting a
 * code cuts off access within the URL lifetime.
 */
export class S3VideoStorage implements VideoStorage {
  readonly driver = "s3" as const;
  private readonly client: AwsClient;

  constructor(private readonly config: S3Config) {
    this.client = new AwsClient({
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      service: "s3",
      region: config.region,
    });
  }

  /** Path-style URL, supported by every S3-compatible provider. */
  objectUrl(key: string): string {
    const base = this.config.endpoint.replace(/\/+$/, "");
    return `${base}/${encodeURIComponent(this.config.bucket)}/${key.split("/").map(encodeURIComponent).join("/")}`;
  }

  private async presign(key: string, method: "GET" | "PUT", ttlSeconds: number): Promise<string> {
    const url = new URL(this.objectUrl(key));
    url.searchParams.set("X-Amz-Expires", String(ttlSeconds));
    const signed = await this.client.sign(new Request(url, { method }), { aws: { signQuery: true } });
    return signed.url;
  }

  async createUploadTarget(key: string, contentType: string): Promise<UploadTarget> {
    // Size and type can't be enforced by a presigned PUT, so both are verified on completion.
    return { url: await this.presign(key, "PUT", UPLOAD_URL_TTL_SECONDS), method: "PUT", headers: { "Content-Type": contentType } };
  }

  presignDownload(key: string): Promise<string> {
    return this.presign(key, "GET", DOWNLOAD_URL_TTL_SECONDS);
  }

  async size(key: string): Promise<number | null> {
    const response = await this.client.fetch(this.objectUrl(key), { method: "HEAD" });
    if (response.status === 404) return null;
    if (!response.ok) throw new StorageError(`Storage HEAD failed (${response.status}).`);
    const length = Number(response.headers.get("content-length"));
    return Number.isFinite(length) ? length : null;
  }

  async readHead(key: string, length: number): Promise<Uint8Array> {
    const response = await this.client.fetch(this.objectUrl(key), { headers: { Range: `bytes=0-${length - 1}` } });
    if (!response.ok) throw new StorageError(`Storage read failed (${response.status}).`);
    return new Uint8Array(await response.arrayBuffer()).subarray(0, length);
  }

  async delete(key: string): Promise<void> {
    const response = await this.client.fetch(this.objectUrl(key), { method: "DELETE" });
    if (!response.ok && response.status !== 404) throw new StorageError(`Storage delete failed (${response.status}).`);
  }
}
