"use client";

import { ApiError, request, type UploadCredentials } from "@/features/dynamic/api";

export interface UploadConfig {
  enabled: boolean;
  driver: "local" | "s3" | "disabled";
  maxBytes: number;
}

export function fetchUploadConfig(): Promise<UploadConfig> {
  return request<UploadConfig>("/api/uploads");
}

interface Reservation {
  uploadId: string;
  uploadToken: string;
  target: { url: string; method: "PUT"; headers: Record<string, string> };
}

/**
 * XMLHttpRequest instead of fetch: it is the only browser API that reports upload
 * progress. Resolves when the server/storage accepted the body.
 */
function putWithProgress(
  target: Reservation["target"],
  file: File,
  onProgress: (fraction: number) => void,
  signal: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(target.method, target.url);
    for (const [name, value] of Object.entries(target.headers)) xhr.setRequestHeader(name, value);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      let message = `Upload failed (${xhr.status}).`;
      try {
        const body = JSON.parse(xhr.responseText) as { error?: { message?: string } };
        if (body.error?.message) message = body.error.message;
      } catch {
        // Object storage returns XML errors; keep the generic message.
      }
      reject(new ApiError(xhr.status, "upload_failed", message));
    };
    xhr.onerror = () => reject(new ApiError(0, "network", "The upload was interrupted. Check your connection and try again."));
    xhr.onabort = () => reject(new DOMException("Upload cancelled", "AbortError"));
    signal.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(file);
  });
}

/** Reserve → upload the bytes → confirm. Returns credentials to attach the video to a code. */
export async function uploadVideoFile(
  file: File,
  contentType: string,
  options: { onProgress: (fraction: number) => void; signal: AbortSignal },
): Promise<UploadCredentials> {
  const reservation = await request<Reservation>("/api/uploads", {
    method: "POST",
    body: JSON.stringify({ fileName: file.name, sizeBytes: file.size, contentType }),
  });
  await putWithProgress(reservation.target, file, options.onProgress, options.signal);
  await request<{ ok: true }>(`/api/uploads/${reservation.uploadId}/complete`, {
    method: "POST",
    extraHeaders: { "X-Upload-Token": reservation.uploadToken },
  });
  return { id: reservation.uploadId, token: reservation.uploadToken };
}
