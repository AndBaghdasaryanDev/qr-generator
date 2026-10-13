import { connection } from "next/server";
import { configuredOrigin } from "@/lib/site";
import { DatabaseNotConfiguredError, getDb } from "@/server/db/client";
import { json } from "@/server/http";
import { getVideoUploadConfig } from "@/server/storage/config";

/**
 * Deployment check: is the database reachable, are uploads on, which public origin is used.
 * Reports states only — never connection strings, hosts or error details.
 */
export async function GET(): Promise<Response> {
  await connection();
  let database: "ok" | "not_configured" | "unreachable" = "ok";
  try {
    const db = await getDb();
    await db.qrCodes.findOne({}, { projection: { _id: 1 } });
  } catch (error) {
    database = error instanceof DatabaseNotConfiguredError ? "not_configured" : "unreachable";
    if (database === "unreachable") console.error("Health check: database unreachable", error);
  }
  const uploads = getVideoUploadConfig();
  return json(
    {
      status: database === "ok" ? "ok" : "degraded",
      database,
      videoUploads: uploads.driver,
      maxUploadMb: Math.round(uploads.maxBytes / 1024 / 1024),
      publicOrigin: configuredOrigin() ?? "request",
    },
    { status: database === "ok" ? 200 : 503 },
  );
}
