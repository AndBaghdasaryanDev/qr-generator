import { beforeAll, describe, expect, it } from "vitest";
import { DELETE, GET, PATCH } from "@/app/api/qr-codes/[code]/route";
import { POST } from "@/app/api/qr-codes/route";
import { GET as resolveRoute } from "@/app/r/[code]/route";
import { getDb } from "@/server/db/client";
import { startTestMongo } from "../helpers/mongo";
import { generateManageToken, generatePublicCode, hashToken, PUBLIC_CODE_PATTERN, tokenMatches } from "@/server/dynamic-qr/crypto";
import { createDynamicQr, recordScan, resolvePublicCode, validateDestination, ValidationError } from "@/server/dynamic-qr/service";
import { RateLimiter } from "@/server/rate-limit";

const ORIGIN = "https://qr.test";

beforeAll(async () => {
  await startTestMongo();
});

interface CreatedBody {
  qr: { code: string; shortUrl: string; destinationUrl: string; scanCount: number; isActive: boolean; presentation: string };
  manageToken: string;
  manageUrl: string;
}

function jsonRequest(method: string, url: string, body?: unknown, token?: string, ip = "203.0.113.7"): Request {
  const headers: Record<string, string> = { "x-forwarded-for": ip };
  if (body !== undefined) headers["content-type"] = "application/json";
  if (token) headers.authorization = `Bearer ${token}`;
  return new Request(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}

const ctx = <T extends string>(code: T) => ({ params: Promise.resolve({ code }) });

async function create(body: unknown, ip?: string): Promise<CreatedBody> {
  const res = await POST(jsonRequest("POST", `${ORIGIN}/api/qr-codes`, body, undefined, ip));
  expect(res.status).toBe(201);
  return (await res.json()) as CreatedBody;
}

describe("crypto helpers", () => {
  it("generates well-formed, distinct codes", () => {
    const codes = new Set(Array.from({ length: 2000 }, () => generatePublicCode()));
    expect(codes.size).toBe(2000);
    for (const code of codes) expect(code).toMatch(PUBLIC_CODE_PATTERN);
  });
  it("verifies tokens against their hash only", () => {
    const token = generateManageToken();
    expect(token).toHaveLength(43);
    expect(tokenMatches(token, hashToken(token))).toBe(true);
    expect(tokenMatches(generateManageToken(), hashToken(token))).toBe(false);
  });
});

describe("destination validation", () => {
  it.each([
    ["http://localhost:3000/x", /private or local/],
    ["https://192.168.1.10/admin", /private or local/],
    ["https://[::1]/", /private or local/],
    ["https://printer.local/", /private or local/],
    ["javascript:alert(1)", /aren't supported/],
    ["https://user:pass@example.com", /username or password/],
    [`${ORIGIN}/r/abcdefghij`, /another dynamic QR/],
  ])("rejects %s", (input, message) => {
    expect(() => validateDestination(input, ORIGIN)).toThrow(message);
  });
  it("accepts and normalizes public URLs", () => {
    expect(validateDestination("example.com/promo", ORIGIN)).toBe("https://example.com/promo");
  });
});

describe("dynamic QR API", () => {
  it("creates a code and returns the token only once", async () => {
    const body = await create({ name: "Promo", qrType: "url", destinationUrl: "example.com/promo" });
    expect(body.qr.code).toMatch(PUBLIC_CODE_PATTERN);
    expect(body.qr.shortUrl).toBe(`${ORIGIN}/r/${body.qr.code}`);
    expect(body.qr.destinationUrl).toBe("https://example.com/promo");
    expect(body.manageUrl).toBe(`${ORIGIN}/manage/${body.qr.code}#token=${body.manageToken}`);
    expect(JSON.stringify(body.qr)).not.toContain(body.manageToken);
    expect(JSON.stringify(body.qr)).not.toMatch(/hash/i);

    const read = await GET(jsonRequest("GET", `${ORIGIN}/api/qr-codes/${body.qr.code}`, undefined, body.manageToken), ctx(body.qr.code));
    expect(read.status).toBe(200);
    const readBody = (await read.json()) as { qr: Record<string, unknown> };
    expect(readBody.qr).not.toHaveProperty("manageToken");
  });

  it("rejects invalid input with a 400 and a field", async () => {
    const res = await POST(jsonRequest("POST", `${ORIGIN}/api/qr-codes`, { qrType: "url", destinationUrl: "ftp://x.y" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: { code: "validation_error", field: "destinationUrl" } });

    const unknownField = await POST(jsonRequest("POST", `${ORIGIN}/api/qr-codes`, { qrType: "url", destinationUrl: "https://a.com", isAdmin: true }));
    expect(unknownField.status).toBe(400);
  });

  it("rejects non-JSON bodies", async () => {
    const res = await POST(new Request(`${ORIGIN}/api/qr-codes`, { method: "POST", body: "name=x", headers: { "content-type": "text/plain" } }));
    expect(res.status).toBe(415);
  });

  it("only allows the player presentation for playable https video files", async () => {
    const bad = await POST(
      jsonRequest("POST", `${ORIGIN}/api/qr-codes`, { qrType: "video", destinationUrl: "https://youtu.be/dQw4w9WgXcQ", presentation: "player" }),
    );
    expect(bad.status).toBe(400);
    const ok = await create({ qrType: "video", destinationUrl: "https://cdn.example.com/clip.mp4", presentation: "player" });
    expect(ok.qr.presentation).toBe("player");
  });

  it("enforces ownership on read, update and delete", async () => {
    const owner = await create({ qrType: "url", destinationUrl: "https://example.com/a" });
    const other = await create({ qrType: "url", destinationUrl: "https://example.com/b" });
    const url = `${ORIGIN}/api/qr-codes/${owner.qr.code}`;

    expect((await GET(jsonRequest("GET", url), ctx(owner.qr.code))).status).toBe(403);
    expect((await GET(jsonRequest("GET", url, undefined, other.manageToken), ctx(owner.qr.code))).status).toBe(403);
    expect((await GET(jsonRequest("GET", url, undefined, "not-a-valid-token"), ctx(owner.qr.code))).status).toBe(403);

    const hijack = await PATCH(jsonRequest("PATCH", url, { destinationUrl: "https://evil.example" }, other.manageToken), ctx(owner.qr.code));
    expect(hijack.status).toBe(403);
    expect((await DELETE(jsonRequest("DELETE", url, undefined, other.manageToken), ctx(owner.qr.code))).status).toBe(403);

    const resolution = await resolvePublicCode(await getDb(), owner.qr.code, ORIGIN);
    expect(resolution).toMatchObject({ status: "redirect", url: "https://example.com/a" });
  });

  it("updates the destination without changing the code", async () => {
    const created = await create({ qrType: "video", destinationUrl: "https://youtu.be/dQw4w9WgXcQ" });
    const url = `${ORIGIN}/api/qr-codes/${created.qr.code}`;
    const res = await PATCH(jsonRequest("PATCH", url, { destinationUrl: "https://vimeo.com/76979871", name: "New" }, created.manageToken), ctx(created.qr.code));
    expect(res.status).toBe(200);
    const body = (await res.json()) as CreatedBody;
    expect(body.qr.code).toBe(created.qr.code);
    expect(body.qr.destinationUrl).toBe("https://vimeo.com/76979871");

    expect(await resolvePublicCode(await getDb(), created.qr.code, ORIGIN)).toMatchObject({ status: "redirect", url: "https://vimeo.com/76979871" });
  });

  it("falls back to a redirect when a player code gets an unplayable destination", async () => {
    const created = await create({ qrType: "video", destinationUrl: "https://cdn.example.com/a.webm", presentation: "player" });
    const res = await PATCH(
      jsonRequest("PATCH", `${ORIGIN}/api/qr-codes/${created.qr.code}`, { destinationUrl: "https://youtu.be/dQw4w9WgXcQ" }, created.manageToken),
      ctx(created.qr.code),
    );
    expect(((await res.json()) as CreatedBody).qr.presentation).toBe("redirect");
  });

  it("pauses, resumes and soft-deletes codes", async () => {
    const created = await create({ qrType: "url", destinationUrl: "https://example.com/x" });
    const url = `${ORIGIN}/api/qr-codes/${created.qr.code}`;
    const code = created.qr.code;

    await PATCH(jsonRequest("PATCH", url, { isActive: false }, created.manageToken), ctx(code));
    expect(await resolvePublicCode(await getDb(), code, ORIGIN)).toEqual({ status: "disabled" });

    await PATCH(jsonRequest("PATCH", url, { isActive: true }, created.manageToken), ctx(code));
    expect((await resolvePublicCode(await getDb(), code, ORIGIN)).status).toBe("redirect");

    const del = await DELETE(jsonRequest("DELETE", url, undefined, created.manageToken), ctx(code));
    expect(del.status).toBe(204);
    expect(await resolvePublicCode(await getDb(), code, ORIGIN)).toEqual({ status: "deleted" });
    // Deleted codes are gone for the owner too, and can't be revived.
    expect((await GET(jsonRequest("GET", url, undefined, created.manageToken), ctx(code))).status).toBe(404);
    expect((await PATCH(jsonRequest("PATCH", url, { isActive: true }, created.manageToken), ctx(code))).status).toBe(404);
  });

  it("rejects empty updates", async () => {
    const created = await create({ qrType: "url", destinationUrl: "https://example.com/y" });
    const res = await PATCH(jsonRequest("PATCH", `${ORIGIN}/api/qr-codes/${created.qr.code}`, {}, created.manageToken), ctx(created.qr.code));
    expect(res.status).toBe(400);
  });

  it("rate-limits creation per client", async () => {
    const ip = "198.51.100.99";
    const statuses: number[] = [];
    for (let i = 0; i < 31; i++) {
      const res = await POST(jsonRequest("POST", `${ORIGIN}/api/qr-codes`, { qrType: "url", destinationUrl: "https://example.com" }, undefined, ip));
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 30).every((s) => s === 201)).toBe(true);
    expect(statuses[30]).toBe(429);
  });
});

describe("public resolution /r/{code}", () => {
  it("redirects with 302 and no-store", async () => {
    const { view } = await createDynamicQr(await getDb(), { qrType: "url", destinationUrl: "https://example.com/landing" }, ORIGIN);
    const res = await resolveRoute(new Request(`${ORIGIN}/r/${view.code}`), ctx(view.code));
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://example.com/landing");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("sends player codes to the watch page", async () => {
    const { view } = await createDynamicQr(
      await getDb(),
      { qrType: "video", destinationUrl: "https://cdn.example.com/v.mp4", presentation: "player" },
      ORIGIN,
    );
    const res = await resolveRoute(new Request(`${ORIGIN}/r/${view.code}`), ctx(view.code));
    expect(res.headers.get("location")).toBe(`${ORIGIN}/watch/${view.code}`);
  });

  it("returns friendly 404 pages for unknown or malformed codes", async () => {
    for (const code of ["AAAAAAAAAA", "../../etc", "<script>"]) {
      const res = await resolveRoute(new Request(`${ORIGIN}/r/x`), ctx(code));
      expect(res.status).toBe(404);
      const html = await res.text();
      expect(html).toContain("QR code not found");
      expect(html).not.toContain("<script>");
    }
  });

  it("counts scans without storing visitor data", async () => {
    const { view, manageToken } = await createDynamicQr(await getDb(), { qrType: "url", destinationUrl: "https://example.com/count" }, ORIGIN);
    const resolution = await resolvePublicCode(await getDb(), view.code, ORIGIN);
    if (resolution.status !== "redirect") throw new Error("expected redirect");
    await recordScan(await getDb(), resolution.id);
    await recordScan(await getDb(), resolution.id);

    const res = await GET(jsonRequest("GET", `${ORIGIN}/api/qr-codes/${view.code}`, undefined, manageToken), ctx(view.code));
    const body = (await res.json()) as { qr: { scanCount: number; lastScannedAt: string | null } };
    expect(body.qr.scanCount).toBe(2);
    expect(body.qr.lastScannedAt).not.toBeNull();
    expect(Object.keys(body.qr)).not.toEqual(expect.arrayContaining(["ip", "userAgent"]));
  });
});

describe("RateLimiter", () => {
  it("resets after the window", () => {
    let now = 0;
    const limiter = new RateLimiter(2, 1000, () => now);
    expect(limiter.check("a").allowed).toBe(true);
    expect(limiter.check("a").allowed).toBe(true);
    const blocked = limiter.check("a");
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBe(1);
    expect(limiter.check("b").allowed).toBe(true);
    now = 1000;
    expect(limiter.check("a").allowed).toBe(true);
  });
});

it("ValidationError carries the field", () => {
  expect(new ValidationError("x", "destinationUrl").field).toBe("destinationUrl");
});
