import { expect, test, type Page } from "@playwright/test";
import { decodePngFile, download, openGenerator, pick } from "./helpers";

/** ISO-BMFF header + filler: detected as MP4 (browsers can't decode it, which the UI flags). */
function fakeMp4(size: number, seed = 1): Buffer {
  const bytes = Buffer.alloc(size);
  bytes.set([0, 0, 0, 0x18], 0);
  bytes.write("ftypisom", 4, "latin1");
  for (let i = 12; i < size; i++) bytes[i] = (i * seed) % 251;
  return bytes;
}

async function chooseFile(page: Page, name: string, buffer: Buffer) {
  await page.getByLabel(/Choose a video or drop it here/).setInputFiles({ name, mimeType: "video/mp4", buffer });
}

test("upload a video: QR → short link → player page → media served with ranges; replace; delete", async ({ page, request }) => {
  await openGenerator(page, "/video");
  await pick(page, "Upload a file");
  await expect(page.getByText("Upload your video in step 2")).toBeVisible();

  const first = fakeMp4(200_000);
  await chooseFile(page, "Իմ տեսանյութը.mp4", first);
  await expect(page.getByText("Իմ տեսանյութը.mp4")).toBeVisible();
  await expect(page.getByText(/This browser can't play this file/)).toBeVisible();

  const uploadButton = page.getByRole("button", { name: "Upload and create QR code" });
  await expect(uploadButton).toBeDisabled(); // rights confirmation is required
  await page.getByLabel(/I own this video/).check();
  await uploadButton.click();
  await expect(page.getByText("Dynamic code ready")).toBeVisible();
  await expect(page.getByText("Uploaded video: Իմ տեսանյութը.mp4")).toBeVisible();

  // The downloaded code encodes the short link; scanning leads to the player page.
  const shortUrl = (await decodePngFile((await download(page, "PNG")).path))!;
  expect(shortUrl).toMatch(/^http:\/\/localhost:3100\/r\/[0-9A-Za-z]{10}$/);
  const code = shortUrl.split("/").at(-1)!;
  const scan = await request.get(shortUrl, { maxRedirects: 0 });
  expect(scan.status()).toBe(302);
  expect(scan.headers()["location"]).toBe(`http://localhost:3100/watch/${code}`);

  const watch = await page.context().newPage();
  await watch.goto(`/watch/${code}`);
  const src = await watch.locator("video").getAttribute("src");
  expect(src).toMatch(/^\/media\/[0-9a-f-]{36}$/);
  await watch.close();

  const full = await request.get(src!);
  expect(full.status()).toBe(200);
  expect(full.headers()["content-type"]).toBe("video/mp4");
  expect(Buffer.compare(await full.body(), first)).toBe(0);
  const part = await request.get(src!, { headers: { Range: "bytes=1000-1999" } });
  expect(part.status()).toBe(206);
  expect(Buffer.compare(await part.body(), first.subarray(1000, 2000))).toBe(0);

  // Replace the video from the generator: same printed code, new file, old file gone.
  await page.getByRole("button", { name: "Upload a different video" }).click();
  const second = fakeMp4(150_000, 7);
  await chooseFile(page, "second.mp4", second);
  await page.getByLabel(/I own this video/).check();
  await page.getByRole("button", { name: "Upload and replace the video" }).click();
  await expect(page.getByText("Video replaced.")).toBeVisible();
  expect((await request.get(src!)).status()).toBe(404);
  const replacedScan = await request.get(shortUrl, { maxRedirects: 0 });
  expect(replacedScan.headers()["location"]).toBe(`http://localhost:3100/watch/${code}`);

  // Manager shows the file; deleting the code removes the video.
  await page.getByRole("link", { name: "Open manager" }).click();
  // The previous route stays mounted but hidden (React Activity), so only count visible matches.
  await expect(page.getByText("second.mp4").filter({ visible: true })).toBeVisible();
  const watch2 = await page.context().newPage();
  await watch2.goto(`/watch/${code}`);
  const newSrc = (await watch2.locator("video").getAttribute("src"))!;
  await watch2.close();
  expect(Buffer.compare(await (await request.get(newSrc)).body(), second)).toBe(0);

  await page.getByRole("button", { name: "Delete permanently" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
  await expect(page.getByRole("heading", { name: "QR code deleted" })).toBeVisible();
  expect((await request.get(newSrc)).status()).toBe(404);
});

test("non-video files are rejected before upload", async ({ page }) => {
  await openGenerator(page, "/video");
  await pick(page, "Upload a file");
  await page
    .getByLabel(/Choose a video or drop it here/)
    .setInputFiles({ name: "evil.mp4", mimeType: "video/mp4", buffer: Buffer.from("<html><script>alert(1)</script></html>") });
  await expect(page.getByText("This isn't an MP4, WebM or MOV video file.")).toBeVisible();
});

test("large uploads stream through the real server", async ({ request }) => {
  const size = 30 * 1024 * 1024;
  const reserved = await request.post("/api/uploads", { data: { fileName: "big.mp4", sizeBytes: size, contentType: "video/mp4" } });
  expect(reserved.status()).toBe(201);
  const { uploadId, uploadToken, target } = (await reserved.json()) as {
    uploadId: string;
    uploadToken: string;
    target: { url: string; headers: Record<string, string> };
  };
  const put = await request.put(target.url, { data: fakeMp4(size), headers: target.headers, timeout: 120_000 });
  expect(put.status()).toBe(200);
  const done = await request.post(`/api/uploads/${uploadId}/complete`, { headers: { "X-Upload-Token": uploadToken } });
  expect(done.status()).toBe(200);
});

test("upload settings are exposed to the client", async ({ request }) => {
  const res = await request.get("/api/uploads");
  expect(await res.json()).toEqual({ enabled: true, driver: "local", maxBytes: 64 * 1024 * 1024 });
});
