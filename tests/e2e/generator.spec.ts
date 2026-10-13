import { expect, test } from "@playwright/test";
import { chooseType, decodePngFile, decodeSvgFile, download, expectPreviewReady, openGenerator } from "./helpers";

test("homepage explains the product and shows the generator", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/QR Studio/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("QR codes for anything");
  await expect(page.getByRole("img", { name: /Sample QR code/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Static or dynamic?" })).toBeVisible();
});

test("website QR: generated locally without any API call, PNG decodes to the URL", async ({ page }) => {
  const apiCalls: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/")) apiCalls.push(request.url());
  });
  await openGenerator(page);
  await page.getByLabel("Website address").fill("example.com/hello?x=1");
  await expectPreviewReady(page);

  const { path, filename } = await download(page, "PNG");
  expect(filename).toMatch(/^qr-website-1024px\.png$/);
  expect(await decodePngFile(path)).toBe("https://example.com/hello?x=1");
  expect(apiCalls).toEqual([]);
});

test("text QR with Armenian characters and emoji round-trips exactly", async ({ page }) => {
  const text = "Բարեւ, աշխարհ! Ողջույն 👋";
  await openGenerator(page);
  await chooseType(page, /^Text/);
  await page.getByLabel("Text", { exact: true }).fill(text);
  await expectPreviewReady(page);
  const { path } = await download(page, "PNG");
  expect(await decodePngFile(path)).toBe(text);
});

test("YouTube link is detected, cleaned and encoded", async ({ page }) => {
  await openGenerator(page);
  await chooseType(page, /^Video/);
  await page.getByLabel("Video link").fill("https://www.youtube.com/watch?v=dQw4w9WgXcQ&si=tracking&t=42");
  const detected = page.getByRole("region", { name: "Detected video" });
  await expect(detected).toContainText("YouTube video");
  await expect(detected).toContainText("https://youtu.be/dQw4w9WgXcQ?t=42");
  await expectPreviewReady(page);
  const { path } = await download(page, "PNG");
  expect(await decodePngFile(path)).toBe("https://youtu.be/dQw4w9WgXcQ?t=42");
});

test("direct video file is detected and encoded unchanged", async ({ page }) => {
  const url = "https://cdn.example.com/media/clip.mp4";
  await openGenerator(page, "/video");
  await expect(page.getByRole("radio", { name: /^Video/ })).toBeChecked();
  await page.getByLabel("Video link").fill(url);
  await expect(page.getByRole("region", { name: "Detected video" })).toContainText("Direct video file (MP4)");
  await expect(page.getByRole("button", { name: /Test playback/ })).toBeVisible();
  await expectPreviewReady(page);
  const { path } = await download(page, "PNG");
  expect(await decodePngFile(path)).toBe(url);
});

test("custom colors are applied to the preview and the export still scans", async ({ page }) => {
  await openGenerator(page);
  await page.getByLabel("Website address").fill("https://example.com/colors");
  await page.getByLabel("Foreground", { exact: true }).fill("#1e3a8a");
  await page.getByLabel("Background", { exact: true }).fill("#fefce8");
  await expect(page.locator('svg[aria-label^="QR code:"] path')).toHaveAttribute("fill", "#1e3a8a");
  await expect(page.locator('svg[aria-label^="QR code:"] rect').first()).toHaveAttribute("fill", "#fefce8");
  const { path } = await download(page, "PNG");
  expect(await decodePngFile(path)).toBe("https://example.com/colors");
});

test("low-contrast colors block downloads with an explanation", async ({ page }) => {
  await openGenerator(page);
  await page.getByLabel("Website address").fill("https://example.com");
  await page.getByLabel("Foreground", { exact: true }).fill("#eeeeee");
  await expect(page.getByText(/Contrast is 1\.\d:1/)).toBeVisible();
  await expect(page.getByRole("button", { name: /^Download/ })).toBeDisabled();
});

test("SVG export is a valid, self-contained file that decodes", async ({ page }) => {
  await openGenerator(page);
  await chooseType(page, /^Wi-Fi/);
  await page.getByLabel("Network name (SSID)").fill("Cafe;Guest");
  await page.getByLabel("Password", { exact: true }).fill("p:ss,word1");
  await expectPreviewReady(page);
  const { path, filename } = await download(page, "SVG");
  expect(filename).toBe("qr-wi-fi.svg");
  const { text, decoded } = await decodeSvgFile(path);
  expect(text.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
  expect(text).not.toMatch(/<script|javascript:|https?:\/\/(?!www\.w3\.org)/);
  expect(decoded).toBe("WIFI:T:WPA;S:Cafe\\;Guest;P:p\\:ss\\,word1;;");
});

test("invalid input shows an error and disables export", async ({ page }) => {
  await openGenerator(page);
  const field = page.getByLabel("Website address");
  await field.fill("javascript:alert(1)");
  await field.blur();
  await expect(page.getByText(/"javascript:" links aren't supported/).first()).toBeVisible();
  await expect(field).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByRole("button", { name: /^Download/ })).toBeDisabled();
});

test("a design can be saved to the library and reopened", async ({ page }) => {
  await openGenerator(page);
  await chooseType(page, /^Email/);
  await page.getByLabel("Email address").fill("hello@example.com");
  await page.getByLabel(/^Name/).fill("Support email");
  await page.getByRole("button", { name: "Save design to library" }).click();
  await expect(page.getByText("Saved to your library")).toBeVisible();

  await page.goto("/library");
  await expect(page.getByRole("heading", { name: "Support email" })).toBeVisible();
  await page.getByRole("link", { name: "Open" }).click();
  await expect(page.getByLabel("Email address")).toHaveValue("hello@example.com");
  await expect(page.getByRole("radio", { name: /^Email/ })).toBeChecked();
});

test("keyboard-only: pick a type, enter content and download", async ({ page }) => {
  await openGenerator(page);
  await page.getByRole("radio", { name: /^Website/ }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("radio", { name: /^Video/ })).toBeChecked();

  // Tab from the type picker to the video field.
  for (let i = 0; i < 5 && !(await page.getByLabel("Video link").evaluate((el) => el === document.activeElement)); i++) {
    await page.keyboard.press("Tab");
  }
  await expect(page.getByLabel("Video link")).toBeFocused();
  await page.keyboard.type("https://vimeo.com/76979871");

  const button = page.getByRole("button", { name: /^Download PNG/ });
  for (let i = 0; i < 40 && !(await button.evaluate((el) => el === document.activeElement)); i++) {
    await page.keyboard.press("Tab");
  }
  await expect(button).toBeFocused();
  const [file] = await Promise.all([page.waitForEvent("download"), page.keyboard.press("Enter")]);
  expect(await decodePngFile(await file.path())).toBe("https://vimeo.com/76979871");
});
