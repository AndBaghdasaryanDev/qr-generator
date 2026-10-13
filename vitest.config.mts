import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(new URL("./tests/helpers/empty.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    // The first run downloads a MongoDB binary for the integration tests.
    hookTimeout: 180_000,
    include: ["src/**/*.test.ts", "tests/integration/**/*.test.ts"],
    env: {
      // Fixed zone so calendar-event conversions are deterministic.
      TZ: "Asia/Yerevan",
      // Integration tests start their own MongoDB (tests/helpers/mongo.ts).
      APP_URL: "https://qr.test",
    },
  },
});
