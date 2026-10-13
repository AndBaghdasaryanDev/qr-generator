import { describe, expect, it } from "vitest";
import { decodeSvg } from "../../../tests/helpers/decode";
import { encodeQr } from "@/lib/qr/encode";
import { buildGeometry } from "@/lib/qr/geometry";
import { renderSvg } from "@/lib/qr/svg";
import { buildPayload, DEFAULT_VALUES, type FormValuesByType, type QrType } from "./definitions";
import { escapeVText, escapeWifi, isValidIban } from "./formats";
import { resolveSocialProfile } from "./social";

function payloadOf<K extends QrType>(type: K, values: Partial<FormValuesByType[K]>): string {
  const result = buildPayload(type, { ...DEFAULT_VALUES[type], ...values });
  if (!result.ok) throw new Error(`Expected success, got ${JSON.stringify(result.errors)}`);
  return result.payload;
}

function errorsOf<K extends QrType>(type: K, values: Partial<FormValuesByType[K]>) {
  const result = buildPayload(type, { ...DEFAULT_VALUES[type], ...values });
  if (result.ok) throw new Error(`Expected failure, got ${result.payload}`);
  return result;
}

describe("website", () => {
  it("adds https:// to bare domains", () => {
    expect(payloadOf("url", { url: "example.com/menu" })).toBe("https://example.com/menu");
  });
  it("keeps query strings and Unicode paths intact (percent-encoded)", () => {
    expect(payloadOf("url", { url: "https://example.com/ա?q=1&b=2#top" })).toBe("https://example.com/%D5%A1?q=1&b=2#top");
  });
  it("rejects dangerous or unsupported schemes", () => {
    expect(errorsOf("url", { url: "javascript:alert(1)" }).errors.url).toMatch(/aren't supported/);
    expect(errorsOf("url", { url: "data:text/html,hi" }).errors.url).toMatch(/aren't supported/);
  });
  it("rejects credentials in links", () => {
    expect(errorsOf("url", { url: "https://bank.com@evil.example" }).errors.url).toMatch(/username or password/);
  });
  it("rejects hosts without a domain", () => {
    expect(errorsOf("url", { url: "https://intranet" }).errors.url).toMatch(/full domain/);
  });
  it("reports empty required fields as missing rather than invalid", () => {
    expect(errorsOf("url", { url: "  " }).missing).toEqual(["url"]);
  });
});

describe("text", () => {
  it("preserves Armenian, emoji and line breaks exactly", () => {
    const text = "Բարեւ ձեզ 👋\nԵրևան, Հայաստան";
    expect(payloadOf("text", { text })).toBe(text);
  });
});

describe("email", () => {
  it("percent-encodes subject and body (spaces as %20)", () => {
    expect(payloadOf("email", { to: "hi@example.com", subject: "Hello there & welcome", body: "Line 1\nԲարեւ" })).toBe(
      "mailto:hi@example.com?subject=Hello%20there%20%26%20welcome&body=Line%201%0A%D4%B2%D5%A1%D6%80%D5%A5%D6%82",
    );
  });
  it("rejects invalid addresses", () => {
    expect(errorsOf("email", { to: "not-an-email" }).errors.to).toMatch(/valid email/);
  });
});

describe("phone, SMS and WhatsApp", () => {
  it("strips formatting without inventing a country code", () => {
    expect(payloadOf("phone", { phone: "+374 (55) 12-34-56" })).toBe("tel:+37455123456");
    expect(payloadOf("phone", { phone: "055 123 456" })).toBe("tel:055123456");
  });
  it("builds SMSTO payloads", () => {
    expect(payloadOf("sms", { phone: "+1 555 0100", message: "On my way: 5 min" })).toBe("SMSTO:+15550100:On my way: 5 min");
  });
  it("builds wa.me links with encoded messages", () => {
    expect(payloadOf("whatsapp", { phone: "+374 55 123456", message: "Բարեւ & hi?" })).toBe(
      "https://wa.me/37455123456?text=%D4%B2%D5%A1%D6%80%D5%A5%D6%82%20%26%20hi%3F",
    );
    expect(payloadOf("whatsapp", { phone: "0037455123456" })).toBe("https://wa.me/37455123456");
  });
  it("requires an international number for WhatsApp", () => {
    expect(errorsOf("whatsapp", { phone: "055123456" }).errors.phone).toMatch(/country code/);
  });
});

describe("Wi-Fi", () => {
  it("escapes special characters", () => {
    expect(escapeWifi('a;b,c:d\\e"f')).toBe('a\\;b\\,c\\:d\\\\e\\"f');
    expect(payloadOf("wifi", { ssid: "Café;Net", password: "p:ss,word" })).toBe("WIFI:T:WPA;S:Café\\;Net;P:p\\:ss\\,word;;");
  });
  it("omits the password for open networks and marks hidden ones", () => {
    expect(payloadOf("wifi", { ssid: "Guest", security: "nopass", password: "ignored", hidden: true })).toBe(
      "WIFI:T:nopass;S:Guest;H:true;;",
    );
  });
  it("validates WPA password length", () => {
    expect(errorsOf("wifi", { ssid: "Home", password: "short" }).errors.password).toMatch(/8–63/);
  });
});

describe("vCard", () => {
  it("builds a valid vCard 3.0 with escaping", () => {
    const payload = payloadOf("vcard", {
      firstName: "Անի",
      lastName: "Smith, Jr.",
      organization: "Acme; Inc",
      phone: "+1 (555) 010-0200",
      email: "ani@example.com",
      website: "acme.example",
      city: "Yerevan",
      country: "Armenia",
    });
    const lines = payload.split("\r\n");
    expect(lines[0]).toBe("BEGIN:VCARD");
    expect(lines).toContain("VERSION:3.0");
    expect(lines).toContain("N:Smith\\, Jr.;Անի;;;");
    expect(lines).toContain("FN:Անի Smith\\, Jr.");
    expect(lines).toContain("ORG:Acme\\; Inc");
    expect(lines).toContain("TEL;TYPE=WORK,VOICE:+15550100200");
    expect(lines).toContain("URL:https://acme.example/");
    expect(lines).toContain("ADR;TYPE=WORK:;;;Yerevan;;;Armenia");
    expect(lines.at(-1)).toBe("END:VCARD");
  });
  it("requires a name or organization", () => {
    expect(errorsOf("vcard", {}).errors.firstName).toMatch(/name or an organization/);
  });
  it("escapes backslashes before other characters", () => {
    expect(escapeVText("a\\b,c;d\ne")).toBe("a\\\\b\\,c\\;d\\ne");
  });
});

describe("location", () => {
  it("builds map links and geo URIs", () => {
    expect(payloadOf("location", { latitude: "40.1792", longitude: "44.4991" })).toBe(
      "https://www.google.com/maps/search/?api=1&query=40.1792,44.4991",
    );
    expect(payloadOf("location", { latitude: "40.1792", longitude: "44.4991", format: "geo" })).toBe("geo:40.1792,44.4991");
    expect(payloadOf("location", { latitude: "-33.8688", longitude: "151.2093", format: "apple", label: "Opera House" })).toBe(
      "https://maps.apple.com/?ll=-33.8688,151.2093&q=Opera%20House",
    );
  });
  it("validates coordinate ranges", () => {
    expect(errorsOf("location", { latitude: "91", longitude: "0" }).errors.latitude).toMatch(/between -90 and 90/);
    expect(errorsOf("location", { latitude: "0", longitude: "abc" }).errors.longitude).toMatch(/decimal/);
  });
});

describe("social", () => {
  it("builds profile URLs from usernames", () => {
    expect(resolveSocialProfile("instagram", "@ani.photo")).toEqual({ ok: true, url: "https://www.instagram.com/ani.photo/" });
    expect(resolveSocialProfile("tiktok", "creator_1")).toEqual({ ok: true, url: "https://www.tiktok.com/@creator_1" });
  });
  it("accepts matching profile links and rejects other hosts", () => {
    expect(resolveSocialProfile("linkedin", "https://www.linkedin.com/in/ani")).toEqual({
      ok: true,
      url: "https://www.linkedin.com/in/ani",
    });
    expect(resolveSocialProfile("linkedin", "https://evil.example/in/ani").ok).toBe(false);
  });
  it("rejects invalid usernames", () => {
    expect(resolveSocialProfile("x", "this name has spaces").ok).toBe(false);
  });
});

describe("calendar event", () => {
  it("converts local times to UTC (TZ=Asia/Yerevan, UTC+4)", () => {
    const payload = payloadOf("event", {
      title: "Launch, party; v2",
      start: "2026-11-20T18:30",
      end: "2026-11-20T21:00",
      location: "Yerevan",
    });
    expect(payload.split("\r\n")).toEqual([
      "BEGIN:VEVENT",
      "SUMMARY:Launch\\, party\\; v2",
      "DTSTART:20261120T143000Z",
      "DTEND:20261120T170000Z",
      "LOCATION:Yerevan",
      "END:VEVENT",
    ]);
  });
  it("defaults to a one-hour event", () => {
    expect(payloadOf("event", { title: "Call", start: "2026-01-05T09:00" })).toContain("DTEND:20260105T060000Z");
  });
  it("uses exclusive DATE values for all-day events", () => {
    const payload = payloadOf("event", { title: "Holiday", allDay: true, start: "2026-12-31", end: "2027-01-01" });
    expect(payload).toContain("DTSTART;VALUE=DATE:20261231");
    expect(payload).toContain("DTEND;VALUE=DATE:20270102");
  });
  it("rejects an end before the start", () => {
    expect(errorsOf("event", { title: "X", start: "2026-01-05T09:00", end: "2026-01-05T08:00" }).errors.end).toMatch(/after/);
  });
});

describe("app download", () => {
  it("checks the store host", () => {
    expect(payloadOf("app", { store: "google", url: "https://play.google.com/store/apps/details?id=com.example" })).toBe(
      "https://play.google.com/store/apps/details?id=com.example",
    );
    expect(errorsOf("app", { store: "apple", url: "https://play.google.com/x" }).errors.url).toMatch(/apps.apple.com/);
  });
});

describe("payment", () => {
  it("validates IBAN checksums", () => {
    expect(isValidIban("DE89 3704 0044 0532 0130 00")).toBe(true);
    expect(isValidIban("DE89 3704 0044 0532 0130 01")).toBe(false);
  });
  it("builds EPC069-12 SEPA payloads", () => {
    expect(
      payloadOf("payment", {
        method: "sepa",
        name: "Red Cross",
        iban: "DE89 3704 0044 0532 0130 00",
        bic: "COBADEFFXXX",
        amount: "12.5",
        reference: "Invoice 42",
      }).split("\n"),
    ).toEqual(["BCD", "002", "1", "SCT", "COBADEFFXXX", "Red Cross", "DE89370400440532013000", "EUR12.50", "", "", "Invoice 42"]);
  });
  it("requires https for payment links", () => {
    expect(errorsOf("payment", { method: "link", url: "http://pay.example/x" }).errors.url).toMatch(/https/);
    expect(payloadOf("payment", { method: "link", url: "https://paypal.me/example/10" })).toBe("https://paypal.me/example/10");
  });
});

describe("structured payloads survive a full render + decode round trip", () => {
  const cases: Array<[QrType, Partial<FormValuesByType[QrType]>]> = [
    ["wifi", { ssid: "Սուրճ;Wi-Fi", password: 'pa"ss:word,1' }],
    ["vcard", { firstName: "Անի", lastName: "Petrosyan", phone: "+37455123456", note: "Line 1\nLine 2" }],
    ["text", { text: "Բարեւ 👋 — emoji & Unicode" }],
  ];
  for (const [type, values] of cases) {
    it(type, () => {
      const payload = payloadOf(type, values as never);
      const encoded = encodeQr(payload, "M");
      if (!encoded.ok) throw new Error(encoded.message);
      const geometry = buildGeometry(encoded.matrix, { margin: 4, moduleStyle: "square", finderStyle: "square", logo: null });
      const svg = renderSvg(geometry, { foreground: "#000000", background: "#ffffff", pixelSize: 600, logoDataUrl: null });
      expect(decodeSvg(svg, 800)).toBe(payload);
    });
  }
});
