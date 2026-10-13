import { readFile } from "node:fs/promises";
import { expect, type Page } from "@playwright/test";
import { PNG } from "pngjs";
import { decodeRgba, decodeSvg } from "../helpers/decode";

export async function openGenerator(page: Page, path = "/") {
  await page.goto(`${path}#generator`);
  await expect(page.getByRole("radio", { name: /^Website/ })).toBeVisible();
}

/**
 * Selects a radio the way a user does: by clicking its visible label (the inputs
 * themselves are visually hidden inside styled cards).
 */
export async function pick(page: Page, name: string | RegExp) {
  const radio = typeof name === "string" ? page.getByRole("radio", { name, exact: true }) : page.getByRole("radio", { name });
  await page.locator("label").filter({ has: radio }).click();
  await expect(radio).toBeChecked();
}

export async function chooseType(page: Page, label: RegExp) {
  await pick(page, label);
}

/** Clicks the download button and returns the saved file path and suggested name. */
export async function download(page: Page, format: "PNG" | "SVG" | "JPEG" = "PNG") {
  await pick(page, format);
  const [file] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: new RegExp(`^Download ${format}`) }).click(),
  ]);
  const path = await file.path();
  return { path, filename: file.suggestedFilename() };
}

/** Decodes a downloaded PNG exactly like a scanner app would. */
export async function decodePngFile(path: string): Promise<string | null> {
  const png = PNG.sync.read(await readFile(path));
  return decodeRgba(new Uint8ClampedArray(png.data), png.width, png.height);
}

export async function decodeSvgFile(path: string): Promise<{ text: string; decoded: string | null }> {
  const text = await readFile(path, "utf8");
  return { text, decoded: decodeSvg(text, 800) };
}

export async function expectPreviewReady(page: Page) {
  await expect(page.getByRole("img", { name: /^QR code:/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Download/ })).toBeEnabled();
}
