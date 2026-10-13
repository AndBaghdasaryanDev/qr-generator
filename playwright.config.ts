import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    acceptDownloads: true,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] }, testIgnore: /mobile\.spec\.ts/ },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /mobile\.spec\.ts/ },
  ],
  webServer: {
    // Production build, served against a throwaway MongoDB (tests/e2e/server.mjs).
    command: `npm run build && node tests/e2e/server.mjs`,
    url: BASE_URL,
    timeout: 300_000,
    reuseExistingServer: !process.env.CI,
    env: {
      PORT: String(PORT),
      APP_URL: BASE_URL,
      VIDEO_UPLOAD_DRIVER: "local",
      VIDEO_STORAGE_DIR: "storage/e2e-videos",
      VIDEO_MAX_UPLOAD_MB: "64",
      RATE_LIMIT_UPLOADS_PER_HOUR: "100",
    },
  },
});
