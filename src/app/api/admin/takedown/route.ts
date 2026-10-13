import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { getDb } from "@/server/db/client";
import { findByCode, softDeleteDynamicQr } from "@/server/dynamic-qr/service";
import { handleError, json, jsonError, readJsonBody } from "@/server/http";
import { limits } from "@/server/limits";
import { clientKey } from "@/server/rate-limit";
import { getVideoStorageOrNull } from "@/server/storage/config";

const bodySchema = z.object({ code: z.string().regex(/^[0-9A-Za-z]{10}$/) }).strict();

function isAdmin(request: Request): boolean {
  const configured = process.env.ADMIN_TOKEN ?? "";
  if (configured.length < 32) return false; // disabled unless a strong token is configured
  const provided = /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") ?? "")?.[1] ?? "";
  const a = Buffer.from(provided);
  const b = Buffer.from(configured);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Operator takedown for abuse reports: deletes a dynamic code and any uploaded video.
 * Usage: curl -X POST $APP_URL/api/admin/takedown -H "Authorization: Bearer $ADMIN_TOKEN" \
 *          -H "Content-Type: application/json" -d '{"code":"AbC123xYz9"}'
 */
export async function POST(request: Request): Promise<Response> {
  if (!limits.admin.check(clientKey(request.headers)).allowed) return jsonError(429, "rate_limited", "Too many requests.");
  if (!isAdmin(request)) return jsonError(403, "forbidden", "Not allowed.");
  try {
    const parsed = bodySchema.safeParse(await readJsonBody(request));
    if (!parsed.success) return jsonError(400, "validation_error", "Send {\"code\": \"<10-character code>\"}.");
    const db = await getDb();
    const row = await findByCode(db, parsed.data.code);
    if (!row) return jsonError(404, "not_found", "No such code.");
    if (!row.deletedAt) await softDeleteDynamicQr(db, row, getVideoStorageOrNull());
    console.warn(`Admin takedown of dynamic QR ${row.publicCode}`);
    return json({ ok: true, code: row.publicCode });
  } catch (error) {
    return handleError(error);
  }
}
