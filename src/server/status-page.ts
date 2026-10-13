const escapeHtml = (value: string) =>
  value.replace(/[<>&"']/g, (ch) => `&#${ch.charCodeAt(0)};`);

/**
 * Minimal standalone HTML page for redirect failures. Route handlers can't render React
 * layouts, and these pages must still work when the database is down.
 */
export function statusPage(status: number, title: string, message: string): Response {
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(title)} · QR Studio</title>
<style>
:root{color-scheme:light dark;--bg:#f8fafc;--card:#fff;--fg:#0f172a;--muted:#475569;--border:#e2e8f0;--accent:#4f46e5}
@media (prefers-color-scheme:dark){:root{--bg:#020617;--card:#0f172a;--fg:#f1f5f9;--muted:#94a3b8;--border:#1e293b;--accent:#818cf8}}
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:16px;background:var(--bg);color:var(--fg);font:16px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:420px;width:100%;background:var(--card);border:1px solid var(--border);border-radius:16px;padding:32px;text-align:center}
h1{font-size:1.25rem;margin:0 0 8px}p{color:var(--muted);margin:0 0 24px}
a{display:inline-block;color:#fff;background:var(--accent);text-decoration:none;padding:10px 18px;border-radius:10px;font-weight:600}
a:focus-visible{outline:3px solid var(--accent);outline-offset:3px}
</style>
</head>
<body>
<main>
<h1>${escapeHtml(title)}</h1>
<p>${escapeHtml(message)}</p>
<a href="/">Create your own QR code</a>
</main>
</body>
</html>`;
  return new Response(html, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
