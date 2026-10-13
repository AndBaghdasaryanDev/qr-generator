# QR Studio

A free, full-featured QR code generator built with Next.js 16 (App Router), React 19, TypeScript (strict) and Tailwind CSS 4.

- **Static QR codes** for 14 content types, generated entirely in the browser — no account, no database, no paid API, no app-imposed quota.
- **Dynamic QR codes** (editable short links like `/r/AbC123xYz9`) for web and video destinations, backed by MongoDB (Atlas).
- **Video QR workflow**: YouTube (incl. Shorts), Vimeo, TikTok, Instagram Reels, Facebook, Twitch, Dailymotion, Loom, direct MP4/WebM files and generic video pages — or **upload your own video file** (MP4/WebM/MOV), hosted on local disk or any S3-compatible bucket.
- **Design**: colors, module shapes (square/rounded/dots), corner-eye shapes, quiet zone, error correction, center logo — with scannability checks.
- **Export**: PNG and JPEG rendered at the requested resolution (512–4096 px), self-contained SVG, copy-to-clipboard, print.
- **Library**: saved designs and dynamic-code keys stored privately in the browser.

---

## Contents

1. [Quick start](#quick-start)
2. [Commands](#commands)
3. [Supported QR types](#supported-qr-types)
4. [Static vs dynamic QR codes](#static-vs-dynamic-qr-codes)
5. [Video QR workflow](#video-qr-workflow)
6. [Video uploads](#video-uploads)
7. [Architecture](#architecture)
7. [Environment variables](#environment-variables)
8. [Database](#database)
9. [Deployment](#deployment)
10. [Security & privacy](#security--privacy)
11. [Testing](#testing)
12. [Limitations](#limitations)

---

## Quick start

Requirements: **Node.js ≥ 20.19** and npm.

```bash
npm install
cp .env.example .env.local     # then set MONGODB_URI (see Database)
npm run dev                    # http://localhost:3000
```

Static QR generation works immediately, with no database. Dynamic codes and video uploads need `MONGODB_URI`; without it those endpoints answer `503` with a clear message.

> npm 11+ may report that install scripts for `esbuild` / `unrs-resolver` were blocked. Both ship prebuilt platform binaries as optional dependencies and work without those scripts; nothing needs approving.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm start` | Serve the production build (`next start`) |
| `npm run typecheck` | Generate route types and run `tsc --noEmit` |
| `npm run lint` | ESLint (Next.js core-web-vitals + TypeScript rules) |
| `npm test` | Unit + integration tests (Vitest) |
| `npm run test:e2e` | End-to-end tests (Playwright; builds the app and serves it on port 3100) |
| `npm run check` | typecheck + lint + unit/integration tests |

First-time E2E setup: `npx playwright install chromium`. Integration and E2E tests start a temporary MongoDB with `mongodb-memory-server`; the first run downloads a `mongod` binary (~800 MB, cached afterwards). They never touch your Atlas database.

## Supported QR types

| Type | Payload | Notes |
| --- | --- | --- |
| Website | `https://…` | Adds `https://` to bare domains; rejects non-http(s) schemes and embedded credentials |
| Video | cleaned video URL | See [Video QR workflow](#video-qr-workflow) |
| Text | UTF-8 text | Any language (Armenian, CJK, emoji…); capacity is enforced in bytes |
| Email | `mailto:` | Subject/body percent-encoded |
| Phone | `tel:` | Formatting stripped; country codes are never guessed |
| SMS | `SMSTO:number:message` | |
| WhatsApp | `https://wa.me/<digits>?text=…` | Requires an international number |
| Wi-Fi | `WIFI:T:…;S:…;P:…;H:…;;` | `\ ; , : "` escaped; WPA/WEP key length checked |
| Contact card | vCard 3.0 | Person or business; RFC 6350 escaping |
| Location | Google Maps / Apple Maps link or `geo:` URI | Coordinate ranges validated |
| Social profile | profile URL | 11 networks + "other"; username *or* link, host checked |
| Calendar event | iCalendar `VEVENT` | Times converted to UTC from the creator's time zone; all-day events supported |
| App download | store link | App Store / Google Play host checks |
| Payment | provider link (https) or EPC069-12 SEPA transfer (GiroCode) | IBAN mod-97 check; the app never handles money |

Every payload builder lives in `src/lib/payloads/` and is covered by tests that **render the code and decode it with a scanner library**.

## Static vs dynamic QR codes

| | Static | Dynamic |
| --- | --- | --- |
| Generated | In the browser | Short link created on the server |
| Needs this app online when scanned | No | **Yes** (and its database) |
| Edit destination after printing | No | Yes |
| Scan count | No | Yes (aggregate counter only) |
| Pause / delete | No | Yes |
| Account | None | None — ownership is a secret management key |

A static code is never labelled dynamic: the preview badge, the downloaded file and the preview's "Encoded content" panel always show exactly what is encoded.

**Ownership without accounts.** Creating a dynamic code returns a 256-bit management token, shown as a link like `/manage/AbC123xYz9#token=…`. Only a SHA-256 hash is stored. The token lives in the URL *fragment* (never sent to servers or logged), is saved in the browser's library, and is sent as `Authorization: Bearer …` for edits. Lost tokens cannot be recovered.

## Video QR workflow

1. Open **Video QR** (`/video`) or pick the Video type.
2. Paste a link. It is parsed locally — the server never fetches it.
3. The detected destination is shown: platform, video ID, YouTube thumbnail, and the exact URL to encode. YouTube links are normalized (`youtu.be/ID`, tracking params like `si` removed, `t` and `list` kept; Shorts stay Shorts). Other URLs are encoded unchanged.
4. Direct files are detected by path extension only (`.mp4 .webm .ogv .mov .m4v .m3u8`) — not by the word "video". "Test playback" plays the file in your browser to check the host allows it.
5. Choose **static** (encode the video URL) or **dynamic** (short link). For direct **https** files a dynamic code can open a player page (`/watch/CODE`) with native controls instead of the raw file.
6. Customize, download, scan.

Autoplay: the player never autoplays with sound (browsers block it); the viewer presses play.

## Video uploads

Instead of pasting a link, users can choose **Upload a file** in the Video type (or on the manage page) and upload an MP4, WebM or MOV file.

**Flow**

1. The browser checks the file locally: real type from magic bytes, size limit, and whether this browser can decode it (with a local preview). Users must confirm they have the rights to share it.
2. `POST /api/uploads` reserves an upload (size and type validated, storage quota checked, per-IP rate limit) and returns a one-time upload token plus where to send the bytes.
3. The browser uploads with progress and cancel:
   - **local driver**: `PUT /api/uploads/{id}/content` — streamed to disk, never buffered in memory, cut off as soon as it exceeds the declared size;
   - **s3 driver**: directly to the bucket with a 15-minute presigned `PUT` URL (so serverless request-size limits don't apply).
4. `POST /api/uploads/{id}/complete` verifies the stored size and magic bytes; a mismatch deletes the object.
5. The upload is attached to a **dynamic** code (`/r/CODE`). By default scanning opens the player page (`/watch/CODE`); "Open the file" redirects straight to `/media/{id}`.

An uploaded video is hosted by this service, so its QR code is **always dynamic** — it stops working if the service goes offline. In return, the owner can replace the video (the printed code stays the same), switch the code to a link, pause it or delete it.

**Serving.** `/media/{id}` serves a video only while its code exists and is active. Local files are streamed with HTTP range requests (needed for seeking and iOS playback); S3 objects are served by redirecting to a 1-hour presigned `GET` URL, so the bucket stays private.

**Housekeeping.** Replacing a video, switching to a link, deleting a code or an admin takedown deletes the file from storage. Uploads that are never finished or never attached to a code are removed after 24 hours (checked opportunistically on new uploads — no cron needed).

**Moderation.** There is no automated content scanning. Operators should publish an abuse contact and use the takedown endpoint (enabled when `ADMIN_TOKEN` is set):

```bash
curl -X POST "$APP_URL/api/admin/takedown" -H "Authorization: Bearer $ADMIN_TOKEN" \
     -H "Content-Type: application/json" -d '{"code":"AbC123xYz9"}'
```

**Configuration and costs**

| Setup | When to use | Cost notes |
| --- | --- | --- |
| `VIDEO_UPLOAD_DRIVER=local` | Development; one VPS/container with a persistent volume (`VIDEO_STORAGE_DIR`) | Disk space and the server's outbound bandwidth — every view is served by your server |
| `VIDEO_UPLOAD_DRIVER=s3` | Vercel/serverless or anything multi-instance | Storage + requests + egress. Cloudflare R2 has a free tier and no egress fees; AWS S3 charges for egress. Check current provider pricing |
| `VIDEO_UPLOAD_DRIVER=disabled` | Link-only service (production default) | — |

For S3-compatible buckets, configure **CORS** to allow `PUT` with the `Content-Type` header from your site's origin, for example:

```json
[{ "AllowedOrigins": ["https://your-domain.com"], "AllowedMethods": ["PUT"], "AllowedHeaders": ["Content-Type"], "MaxAgeSeconds": 3600 }]
```

and set `VIDEO_S3_ENDPOINT` at **build** time too (it's added to the CSP `connect-src`). Videos are stored as uploaded — there is no transcoding, so an HEVC/H.265 file (common from iPhones) won't play in some browsers; the uploader warns when the current browser can't decode a file.

## Architecture

```
src/
  app/                       Routes (App Router)
    page.tsx                 Landing + generator (static prerender)
    video/                   Video QR page
    library/                 Local library (client)
    manage/[code]/           Dynamic-code manager (client, token from URL fragment)
    watch/[code]/            Player page for "player" dynamic codes
    r/[code]/route.ts        Public resolver: 302 → destination, 404/403/410 status pages
    media/[id]/route.ts      Uploaded-video delivery (range requests / presigned redirect)
    api/qr-codes/…           Create (POST) / read, update, delete (GET, PATCH, DELETE)
    api/uploads/…            Upload config, reserve, local body upload, complete
    api/admin/takedown/      Operator takedown (ADMIN_TOKEN)
  lib/                       Framework-free domain logic (runs in browser, server and tests)
    qr/                      encode → geometry → svg | raster; assessment; logo processing
    payloads/                Zod schemas + payload builders per type
    video/classify.ts        Video URL classification
    validation/url.ts        Safe http(s) URL parsing, private-host detection
  server/                    Server-only: db (MongoDB client + document types), dynamic-qr and video-uploads services,
                             storage drivers (local disk, S3-compatible), rate limiter, HTTP helpers
  features/                  UI features: generator, qr (preview/export), library, dynamic (manage/player),
                             video-upload (uploader), marketing
  components/                Design system (ui/) and app shell (layout/)
tests/                       integration/ (Vitest + real DB), e2e/ (Playwright), helpers/ (decoding)
```

**Data flow (static):** form values → Zod schema (`buildPayload`) → payload string → `encodeQr` (the `qrcode` library builds the module matrix, UTF-8 byte mode) → `buildGeometry` (one SVG path for all dark shapes, logo placement, alignment/finder patterns) → rendered by React for the preview, serialized by `renderSvg`, or drawn by `renderRaster` via `Path2D` at integer pixels per module. Preview and every export share the same geometry, so what you see is what you download.

**Data flow (dynamic):** generator → `POST /api/qr-codes` (validated again server-side) → code + token → QR encodes `APP_URL/r/CODE` → scan → `/r/[code]` looks up the row, re-validates the destination, responds `302` with `Cache-Control: no-store`, and increments the counter after the response (`after()`).

Key decisions:
- **Own geometry layer over `qrcode`'s renderers**: needed for shapes and logos while keeping one code path for SVG/PNG/preview. Alignment patterns are always drawn solid — a decode test showed dot-shaped alignment patterns break detection.
- **Route Handler for `/r/[code]`**: with Cache Components a page would stream and could not send a real HTTP redirect.
- **MongoDB with the official driver**: two small collections, indexes ensured at startup, no ORM or migration step; atomic updates (`$inc`, conditional `findOneAndUpdate`) instead of multi-document transactions.
- **No component library**: a small set of accessible primitives (native `<dialog>`, native radio groups, switch, toasts with `aria-live`) avoided extra dependencies. React Hook Form was not needed: forms are small, controlled, and validated by shared Zod schemas on every change.
- **No accounts**: static generation needs none, and capability links give dynamic-code ownership without collecting emails.

## Environment variables

See `.env.example`.

| Variable | Required | Purpose |
| --- | --- | --- |
| `APP_URL` | **Production** | Public origin for short links, metadata, sitemap. Without it, short links use the request origin. |
| `MONGODB_URI` | **For dynamic codes & uploads** | MongoDB connection string (`mongodb+srv://…`). When unset, dynamic endpoints return 503 while static generation keeps working. |
| `MONGODB_DB` | No | Database name, default `qr_studio` |
| `BLOCKED_DESTINATION_HOSTS` | No | Comma-separated hosts dynamic codes may not redirect to |
| `RATE_LIMIT_CREATE_PER_10_MIN` | No | Default 30 creations / IP / 10 min / instance |
| `RATE_LIMIT_MANAGE_PER_10_MIN` | No | Default 300 owner requests / IP / 10 min / instance |
| `VIDEO_UPLOAD_DRIVER` | No | `local`, `s3` or `disabled` (default: `local` in development, `disabled` in production) |
| `VIDEO_MAX_UPLOAD_MB` | No | Per-file limit, default 100 |
| `VIDEO_STORAGE_QUOTA_GB` | No | Total stored video before uploads are refused, default 5 |
| `RATE_LIMIT_UPLOADS_PER_HOUR` | No | Default 10 uploads / IP / hour / instance |
| `VIDEO_STORAGE_DIR` | local driver | Default `storage/videos` |
| `VIDEO_S3_ENDPOINT`, `VIDEO_S3_BUCKET`, `VIDEO_S3_REGION`, `VIDEO_S3_ACCESS_KEY_ID`, `VIDEO_S3_SECRET_ACCESS_KEY` | s3 driver | Bucket credentials; endpoint also needed at build time |
| `ADMIN_TOKEN` | No | ≥ 32 characters; enables `/api/admin/takedown` |

## Database

MongoDB (tested with MongoDB Atlas-compatible server 8.x, driver 7). Two collections (`src/server/db/types.ts`):

- `qr_codes`: public code (unique index), token hash, name, type, destination, presentation, design (no logos), active flag, scan count, last-scan time, timestamps, soft-delete marker, optional `videoAssetId`. Deleted codes keep their document so the short link is never reissued to someone else.
- `video_assets`: storage key (unique), verified content type, size, display-only original name, status (`pending`/`ready`/`deleted`), upload-token hash, owning code. Video bytes are never stored in the database.

There are no migrations: collections and indexes are created automatically (idempotently) when the app first connects. The client is cached per process, so serverless instances reuse their connection pool. Scan counts use atomic `$inc`; attaching an upload is an atomic conditional update, so the same video can never be attached twice.

**MongoDB Atlas setup**
1. Create a free **M0** cluster.
2. *Database Access*: add a database user with a strong password (role: read and write to any database, or scoped to `qr_studio`).
3. *Network Access*: allow your IP for local development. For Vercel, whose outbound IPs change, allow `0.0.0.0/0` (access then relies on the strong password) or use the official Vercel ↔ Atlas integration.
4. *Connect → Drivers*: copy the `mongodb+srv://…` string, replace `<db_password>`, and set it as `MONGODB_URI`. URL-encode special characters in the password.

If Atlas is unreachable or rejects credentials, the API answers `503` and the server log says which (network access vs. credentials).

## Deployment

The app needs a Node.js runtime (Cache Components does not support the Edge runtime).

**Vercel (or similar serverless):**
1. Create a MongoDB Atlas cluster (free M0 tier; 512 MB) — see [Database](#database).
2. For video uploads, create an S3-compatible bucket (e.g. Cloudflare R2) — see [Video uploads](#video-uploads). The serverless filesystem is ephemeral, so the `local` upload driver must not be used there.
3. Set the environment variables (`APP_URL`, `MONGODB_URI`, `MONGODB_DB`, `VIDEO_*`, `ADMIN_TOKEN`) and deploy.

**Single server / VPS / container:** `npm ci && npm run build && npm start` with `MONGODB_URI` set; uploads can use the `local` driver with `VIDEO_STORAGE_DIR` on a persistent volume.

**Static-only hosting is not supported as-is** (the redirect, API and player routes need a server). Static QR generation itself has no server dependency.

Nothing has been deployed as part of this project; the steps above are untested against any specific provider account.

## Security & privacy

- **Validation everywhere**: Zod on the client for UX and again on the server for every API input (`.strict()` objects, body size limit 16 KB, JSON content type required).
- **Redirect safety**: only `http(s)` destinations; credentials in URLs, loopback/private/link-local hosts and links to other `/r/` codes are rejected; destinations are re-validated on every redirect. This is not an open redirect: `/r/` only follows destinations stored by a token holder. Abuse (e.g. phishing via short links) is mitigated by rate limits, an optional host blocklist, and pausing — there is no automated URL-reputation check.
- **No SSRF surface**: the server never fetches user-supplied URLs.
- **Authorization**: constant-time comparison of token hashes; 403 for wrong/missing tokens, 404 for unknown/deleted codes. Bearer tokens (not cookies) mean no CSRF exposure.
- **Logo uploads**: checked by size (≤ 2 MB) and magic bytes (PNG/JPEG/WebP only — SVG refused), decoded and re-encoded through a canvas, and never leave the browser.
- **Video uploads**: type decided by magic bytes on both client and server (never by file name or browser MIME type); size enforced while streaming (local) or verified after upload (S3); storage keys are server-generated UUIDs, so user file names never reach the filesystem; upload tokens are hashed; per-IP rate limit and a global storage quota; videos are only served while their code is active; `Content-Type` comes from the verified type with `nosniff`.
- **Output safety**: SVG export only interpolates validated hex colors, numbers and the re-encoded PNG data URL; titles are XML-escaped.
- **Headers**: CSP (`frame-ancestors 'none'`, `object-src 'none'`, restricted `connect-src`/`img-src`), `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`; `X-Powered-By` removed. `script-src` allows `'unsafe-inline'` because Next.js inlines bootstrap scripts and nonces would force every page to render dynamically.
- **Privacy**: no analytics scripts, no cookies. Scans increment a counter and timestamp — no IPs, user agents or locations. Wi-Fi passwords and logos stay in the browser. Error responses never include stack traces or SQL.

## Testing

```bash
npm test             # 131 unit + integration tests
npm run test:e2e     # 23 Playwright tests (desktop + Pixel 7 viewport)
```

- **Unit**: payload builders and escaping, URL validation, video classification, contrast/logo/density checks, alignment-pattern positions, SVG safety.
- **Round-trip decoding**: generated SVGs are rasterized with resvg and decoded with jsQR for every module/finder style, logos, inverted colors, Armenian/emoji text and dense payloads.
- **Integration** (a real temporary MongoDB via mongodb-memory-server, route handlers called directly): creation, validation errors, ownership on read/update/delete, destination updates, pause/resume/soft delete, player presentation rules, rate limiting, redirect status codes, scan counting.
- **Video uploads** (integration): full local-driver lifecycle (reserve → stream → verify → attach → `/r` → `/media` with ranges/416/HEAD), non-video and oversized files, wrong tokens, double attachment, quota, disabled uploads, pause/replace/switch-to-link/delete removing files, stale-upload cleanup, admin takedown; S3 driver against an in-process fake S3 server (presigned URL shape, size/type verification, deletion of bad objects).
- **E2E** (production build): uploading a video in the UI (Armenian file name), decoding the downloaded QR, player page, byte-exact media and range responses, replacing the video, deleting it, rejecting non-videos, a 30 MB streamed upload; website/text/YouTube/MP4/Wi-Fi codes downloaded as PNG/SVG and decoded; colors; contrast blocking; invalid input; library save/reopen; keyboard-only flow; dynamic create → redirect → update → pause (403) → delete (410); player page; unauthorized API attempts; security headers; mobile overflow and menu.

## Limitations

- **QR capacity is physical**: at most 2,953 bytes (level L) down to 1,273 bytes (level H) in byte mode. Long content should be hosted and linked.
- **No guaranteed scannability**: the checks are heuristics. Always test printed codes with several phones.
- **Dynamic codes depend on this deployment** (domain, server, database). If it goes offline, dynamic codes stop working; static ones don't.
- **Rate limiting is per instance and in memory**; serverless/multi-instance deployments should add an edge/WAF limiter.
- **Scan counts are approximate**: link-preview bots in chat apps also hit short links.
- **Library is per browser**: clearing site data deletes saved designs and dynamic-code keys (codes keep working on the server, but can't be edited without the key).
- **Logos are not stored server-side**: re-downloading a dynamic code from the manager produces it without the logo.
- **Uploaded videos are stored as-is**: no transcoding, thumbnails or adaptive streaming. Very large files load slowly on mobile data.
- **The S3 driver is tested against a fake S3 server**, not against a real provider account; verify CORS and credentials on your bucket before going live.
- **No automated moderation** of uploaded videos; the operator must handle abuse reports (takedown endpoint provided).
- **Not implemented**: user accounts, per-scan analytics, PDF export (use Print → "Save as PDF"), platform-aware app-store redirects, automated malicious-URL screening.
- **Browser support for exports** relies on Canvas `Path2D`, `roundRect` and `createImageBitmap` (all current evergreen browsers). Clipboard image copy depends on the browser's Clipboard API and may be refused; download still works.
