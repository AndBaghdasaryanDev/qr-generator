import { expect, test, type Page } from "@playwright/test";
import { decodePngFile, download, expectPreviewReady, openGenerator } from "./helpers";

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

test("pages fit the mobile viewport without horizontal scrolling", async ({ page }) => {
  for (const path of ["/", "/video", "/library", "/manage/AAAAAAAAAA"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    await expectNoHorizontalOverflow(page);
  }
});

test("mobile menu opens, navigates and closes with Escape", async ({ page }) => {
  await page.goto("/");
  const toggle = page.getByRole("button", { name: "Open menu" });
  await toggle.click();
  const mobileNav = page.getByRole("navigation", { name: "Mobile" });
  await expect(mobileNav).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(mobileNav).toBeHidden();
  await expect(toggle).toBeFocused();

  await toggle.click();
  await mobileNav.getByRole("link", { name: "Video QR" }).click();
  await expect(page).toHaveURL(/\/video$/);
  await expect(page.getByRole("navigation", { name: "Mobile" })).toBeHidden();
});

test("the full generate-and-download flow works on a phone", async ({ page }) => {
  await openGenerator(page);
  await page.getByLabel("Website address").fill("https://example.com/mobile");
  await expectPreviewReady(page);
  await expectNoHorizontalOverflow(page);
  const { path } = await download(page, "PNG");
  expect(await decodePngFile(path)).toBe("https://example.com/mobile");
});
