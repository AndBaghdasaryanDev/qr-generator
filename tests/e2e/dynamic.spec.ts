import { expect, test, type APIRequestContext } from "@playwright/test";
import { chooseType, decodePngFile, download, openGenerator, pick } from "./helpers";

async function expectRedirect(request: APIRequestContext, shortUrl: string, location: string) {
  const response = await request.get(shortUrl, { maxRedirects: 0 });
  expect(response.status()).toBe(302);
  expect(response.headers()["location"]).toBe(location);
  expect(response.headers()["cache-control"]).toBe("no-store");
}

test("dynamic video QR: create, scan (redirect), update destination, pause and delete", async ({ page, request }) => {
  await openGenerator(page, "/video");
  await page.getByLabel("Video link").fill("https://www.youtube.com/shorts/abcdefghijk");
  await pick(page, "Dynamic (editable)");
  await expect(page.getByText("Dynamic code not created yet")).toBeVisible();
  await page.getByRole("button", { name: "Create dynamic QR code" }).click();
  await expect(page.getByText("Dynamic code ready")).toBeVisible();

  // The downloaded code contains the short link, not the original destination.
  const { path } = await download(page, "PNG");
  const shortUrl = await decodePngFile(path);
  expect(shortUrl).toMatch(/^http:\/\/localhost:3100\/r\/[0-9A-Za-z]{10}$/);
  await expectRedirect(request, shortUrl!, "https://www.youtube.com/shorts/abcdefghijk");

  // Change the destination without changing the printed code.
  await page.getByLabel("Video link").fill("https://vimeo.com/76979871");
  await page.getByRole("button", { name: "Update destination" }).click();
  await expect(page.getByText("Updated. The printed code now uses the new settings.")).toBeVisible();
  await expectRedirect(request, shortUrl!, "https://vimeo.com/76979871");

  // Manage page: scan count, pause, delete.
  await page.getByRole("link", { name: "Open manager" }).click();
  await expect(page.getByRole("heading", { name: "Manage dynamic QR code" })).toBeVisible();
  await expect(page).not.toHaveURL(/token=/); // the key is stripped from the address bar
  // The two redirect checks above were real scans of the short link.
  await expect(page.getByText("Scans", { exact: true }).locator("xpath=following-sibling::dd")).toHaveText("2");
  await page.getByRole("button", { name: "Pause code" }).click();
  await expect(page.getByText("Paused", { exact: true })).toBeVisible();
  const paused = await request.get(shortUrl!, { maxRedirects: 0 });
  expect(paused.status()).toBe(403);
  expect(await paused.text()).toContain("QR code paused");

  await page.getByRole("button", { name: "Delete permanently" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
  await expect(page.getByRole("heading", { name: "QR code deleted" })).toBeVisible();
  const gone = await request.get(shortUrl!, { maxRedirects: 0 });
  expect(gone.status()).toBe(410);
});

test("direct video with the player page", async ({ page, request }) => {
  await openGenerator(page, "/video");
  await page.getByLabel("Video link").fill("https://cdn.example.com/promo.mp4");
  await pick(page, "Dynamic (editable)");
  await pick(page, "Show video player page");
  await page.getByRole("button", { name: "Create dynamic QR code" }).click();
  await expect(page.getByText("Dynamic code ready")).toBeVisible();
  const shortUrl = (await decodePngFile((await download(page, "PNG")).path))!;
  const code = shortUrl.split("/").at(-1);

  await expectRedirect(request, shortUrl, `http://localhost:3100/watch/${code}`);
  await page.goto(`/watch/${code}`);
  const video = page.locator("video");
  await expect(video).toHaveAttribute("src", "https://cdn.example.com/promo.mp4");
  await expect(video).toHaveAttribute("controls", "");
  await expect(page.getByRole("link", { name: /Open the video file directly/ })).toBeVisible();
});

test("unauthorized users cannot read or modify a dynamic code", async ({ page, request, browser }) => {
  await openGenerator(page);
  await chooseType(page, /^Website/);
  await page.getByLabel("Website address").fill("https://example.com/owned");
  await pick(page, "Dynamic (editable)");
  await page.getByRole("button", { name: "Create dynamic QR code" }).click();
  await expect(page.getByText("Dynamic code ready")).toBeVisible();
  const shortUrl = (await decodePngFile((await download(page, "PNG")).path))!;
  const code = shortUrl.split("/").at(-1)!;

  const attempts = [
    request.patch(`/api/qr-codes/${code}`, { data: { destinationUrl: "https://evil.example" } }),
    request.patch(`/api/qr-codes/${code}`, {
      data: { destinationUrl: "https://evil.example" },
      headers: { Authorization: `Bearer ${"x".repeat(43)}` },
    }),
    request.delete(`/api/qr-codes/${code}`, { headers: { Authorization: "Bearer guessing" } }),
    request.get(`/api/qr-codes/${code}`),
  ];
  for (const response of await Promise.all(attempts)) expect(response.status()).toBe(403);
  await expectRedirect(request, shortUrl, "https://example.com/owned");

  // A different browser without the key sees no management data.
  const stranger = await browser.newContext();
  const strangerPage = await stranger.newPage();
  await strangerPage.goto(`/manage/${code}`);
  await expect(strangerPage.getByText("Management link required")).toBeVisible();
  await stranger.close();
});

test("unknown short codes get a friendly 404", async ({ request }) => {
  const response = await request.get("/r/ZZZZZZZZZZ", { maxRedirects: 0 });
  expect(response.status()).toBe(404);
  expect(await response.text()).toContain("QR code not found");
});

test("security headers are present", async ({ request }) => {
  const response = await request.get("/");
  const headers = response.headers();
  expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(headers["x-powered-by"]).toBeUndefined();
});
