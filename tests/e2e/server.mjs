// Starts a throwaway MongoDB, then `next start` pointed at it. Used by playwright.config.ts.
import { spawn } from "node:child_process";
import { MongoMemoryServer } from "mongodb-memory-server";

const mongo = await MongoMemoryServer.create();
const next = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", process.env.PORT ?? "3100"], {
  stdio: "inherit",
  env: { ...process.env, MONGODB_URI: mongo.getUri(), MONGODB_DB: "qr_studio_e2e" },
});

async function shutdown(code = 0) {
  next.kill();
  await mongo.stop().catch(() => undefined);
  process.exit(code);
}

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
next.on("exit", (code) => void shutdown(code ?? 0));
