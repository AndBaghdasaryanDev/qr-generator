import { getDb } from "@/server/db/client";
import { createDynamicQr } from "@/server/dynamic-qr/service";
import { appOrigin, handleError, json, jsonError, readJsonBody } from "@/server/http";
import { limits } from "@/server/limits";
import { clientKey } from "@/server/rate-limit";

/** Creates a dynamic QR code. Returns the management token exactly once. */
export async function POST(request: Request) {
  const limit = limits.create.check(clientKey(request.headers));
  if (!limit.allowed) {
    return jsonError(429, "rate_limited", "You're creating dynamic QR codes too quickly. Please wait a few minutes.", {
      "Retry-After": String(limit.retryAfterSeconds),
    });
  }
  try {
    const body = await readJsonBody(request);
    const origin = appOrigin(request);
    const { view, manageToken } = await createDynamicQr(await getDb(), body, origin);
    return json(
      { qr: view, manageToken, manageUrl: `${origin}/manage/${view.code}#token=${manageToken}` },
      { status: 201 },
    );
  } catch (error) {
    return handleError(error);
  }
}
