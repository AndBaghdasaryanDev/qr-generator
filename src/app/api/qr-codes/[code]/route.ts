import { getDb } from "@/server/db/client";
import type { QrCodeDoc } from "@/server/db/types";
import { getOwnedQr, loadView, softDeleteDynamicQr, updateDynamicQr } from "@/server/dynamic-qr/service";
import { getVideoStorageOrNull } from "@/server/storage/config";
import { appOrigin, bearerToken, handleError, json, jsonError, readJsonBody } from "@/server/http";
import { limits } from "@/server/limits";
import { clientKey } from "@/server/rate-limit";

type Context = RouteContext<"/api/qr-codes/[code]">;
type AuthResult = { ok: true; row: QrCodeDoc } | { ok: false; response: Response };

/**
 * Owner-only endpoints. Authorization is the management token in the Authorization
 * header — no cookies are involved, so cross-site requests can't ride on a session (CSRF).
 */
async function authorize(request: Request, context: Context): Promise<AuthResult> {
  const limit = limits.manage.check(clientKey(request.headers));
  if (!limit.allowed) {
    return {
      ok: false,
      response: jsonError(429, "rate_limited", "Too many requests. Please wait a few minutes.", {
        "Retry-After": String(limit.retryAfterSeconds),
      }),
    };
  }
  const { code } = await context.params;
  const lookup = await getOwnedQr(await getDb(), code, bearerToken(request));
  if (lookup.status === "not-found") {
    return { ok: false, response: jsonError(404, "not_found", "This QR code doesn't exist or was deleted.") };
  }
  if (lookup.status === "forbidden") {
    return { ok: false, response: jsonError(403, "forbidden", "The management key is missing or doesn't match this QR code.") };
  }
  return { ok: true, row: lookup.row };
}

export async function GET(request: Request, context: Context): Promise<Response> {
  try {
    const auth = await authorize(request, context);
    if (!auth.ok) return auth.response;
    return json({ qr: await loadView(await getDb(), auth.row, appOrigin(request)) });
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(request: Request, context: Context): Promise<Response> {
  try {
    const auth = await authorize(request, context);
    if (!auth.ok) return auth.response;
    const body = await readJsonBody(request);
    const view = await updateDynamicQr(await getDb(), auth.row, body, appOrigin(request), getVideoStorageOrNull());
    return json({ qr: view });
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(request: Request, context: Context): Promise<Response> {
  try {
    const auth = await authorize(request, context);
    if (!auth.ok) return auth.response;
    await softDeleteDynamicQr(await getDb(), auth.row, getVideoStorageOrNull());
    return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return handleError(error);
  }
}
