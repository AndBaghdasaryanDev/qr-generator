export const MAX_URL_LENGTH = 2048;

export type UrlParseResult = { ok: true; url: URL; href: string } | { ok: false; error: string };

const SCHEME_PATTERN = /^([a-z][a-z0-9+.-]*):/i;

/**
 * Parses user input as a web (http/https) URL.
 * - Adds https:// when the user typed a bare domain such as "example.com/page".
 * - Rejects other schemes (javascript:, data:, file:, …) with a helpful message.
 * - Rejects embedded credentials, which are a common phishing disguise
 *   (https://bank.com@evil.example).
 * Syntax-only: nothing is fetched.
 */
export function parseWebUrl(input: string): UrlParseResult {
  const raw = input.trim();
  if (!raw) return { ok: false, error: "Enter a link." };
  if (raw.length > MAX_URL_LENGTH) {
    return { ok: false, error: `Links can be at most ${MAX_URL_LENGTH} characters.` };
  }
  if (/\s/.test(raw)) return { ok: false, error: "Links can't contain spaces." };

  let candidate = raw;
  const scheme = SCHEME_PATTERN.exec(raw)?.[1]?.toLowerCase();
  // "example.com:8080/x" and "localhost:3000" look like schemes but are host:port.
  const looksLikeHostPort = scheme !== undefined && (scheme.includes(".") || scheme === "localhost");
  if (scheme === undefined || looksLikeHostPort) {
    candidate = `https://${raw.replace(/^\/\//, "")}`;
  } else if (scheme !== "http" && scheme !== "https") {
    return {
      ok: false,
      error: `"${scheme}:" links aren't supported here. Use a link that starts with https:// or http://.`,
    };
  }

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return { ok: false, error: "This doesn't look like a valid link." };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, error: "Only http:// and https:// links are supported." };
  }
  if (url.username || url.password) {
    return { ok: false, error: "Links with an embedded username or password aren't allowed." };
  }
  const host = url.hostname;
  const isIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.startsWith("[");
  if (!isIp && host !== "localhost" && !/^[^.]+(\.[^.]+)+$/.test(host)) {
    return { ok: false, error: "Add a full domain name, for example example.com." };
  }
  if (!isIp && host !== "localhost" && /^\d+$/.test(host.split(".").at(-1) ?? "")) {
    return { ok: false, error: "This doesn't look like a valid domain." };
  }
  return { ok: true, url, href: url.href };
}

/** Hosts that must never be redirect destinations (internal or loopback addresses). */
export function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    return true;
  }
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    );
  }
  if (host.includes(":")) {
    return host === "::" || host === "::1" || /^f[cd]/.test(host) || /^fe[89ab]/.test(host) || host.startsWith("::ffff:");
  }
  return false;
}
