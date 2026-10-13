"use client";

import type { StoredQrStyle } from "@/lib/qr/style";
import type { DynamicQrView } from "@/server/dynamic-qr/service";

export type { DynamicQrView };

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly field?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface ErrorBody {
  error?: { code?: string; message?: string; field?: string };
}

export async function request<T>(
  path: string,
  init: RequestInit & { token?: string; extraHeaders?: Record<string, string> } = {},
): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json", ...init.extraHeaders };
  if (init.body) headers["Content-Type"] = "application/json";
  if (init.token) headers.Authorization = `Bearer ${init.token}`;

  let response: Response;
  try {
    response = await fetch(path, { ...init, headers, signal: AbortSignal.timeout(15_000), cache: "no-store" });
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === "TimeoutError";
    throw new ApiError(
      0,
      timedOut ? "timeout" : "network",
      timedOut ? "The server took too long to respond. Please try again." : "Network error — check your connection and try again.",
    );
  }
  if (response.status === 204) return undefined as T;

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // Non-JSON error page (e.g. from a proxy); fall through to a generic message.
  }
  if (!response.ok) {
    const error = (body as ErrorBody | null)?.error;
    const retry = response.headers.get("retry-after");
    const message =
      error?.message ??
      (response.status === 429
        ? `Too many requests. Try again in ${retry ?? "a few"} seconds.`
        : `Request failed (${response.status}).`);
    throw new ApiError(response.status, error?.code ?? "unknown", message, error?.field);
  }
  return body as T;
}

/** Proof of a finished upload, used to attach the video to a code. */
export interface UploadCredentials {
  id: string;
  token: string;
}

export type CreateDynamicInput = {
  name: string;
  qrType: DynamicQrView["qrType"];
  presentation: DynamicQrView["presentation"];
  style: StoredQrStyle;
} & ({ destinationUrl: string } | { upload: UploadCredentials });

export function createDynamicQr(input: CreateDynamicInput) {
  return request<{ qr: DynamicQrView; manageToken: string; manageUrl: string }>("/api/qr-codes", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function getDynamicQr(code: string, token: string) {
  return request<{ qr: DynamicQrView }>(`/api/qr-codes/${encodeURIComponent(code)}`, { token });
}

export function updateDynamicQr(
  code: string,
  token: string,
  patch: Partial<Pick<DynamicQrView, "name" | "destinationUrl" | "presentation" | "isActive" | "style">> & {
    upload?: UploadCredentials;
  },
) {
  return request<{ qr: DynamicQrView }>(`/api/qr-codes/${encodeURIComponent(code)}`, {
    method: "PATCH",
    token,
    body: JSON.stringify(patch),
  });
}

export function deleteDynamicQr(code: string, token: string) {
  return request<void>(`/api/qr-codes/${encodeURIComponent(code)}`, { method: "DELETE", token });
}

/** The token travels in the URL fragment, which browsers never send to servers or log. */
export function manageUrlFor(shortUrl: string, code: string, token: string): string {
  return `${new URL(shortUrl).origin}/manage/${code}#token=${token}`;
}
