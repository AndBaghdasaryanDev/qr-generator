/**
 * Pure payload builders. Each function assumes its input was already validated
 * (see definitions.ts) and only handles encoding/escaping.
 */

/** Escapes Wi-Fi field values per the ZXing WIFI: format. */
export function escapeWifi(value: string): string {
  return value.replace(/([\\;,:"])/g, "\\$1");
}

export type WifiSecurity = "WPA" | "WEP" | "nopass";

export function wifiPayload(input: { ssid: string; security: WifiSecurity; password: string; hidden: boolean }): string {
  let out = `WIFI:T:${input.security};S:${escapeWifi(input.ssid)};`;
  if (input.security !== "nopass") out += `P:${escapeWifi(input.password)};`;
  if (input.hidden) out += "H:true;";
  return `${out};`;
}

/** Escapes text values for vCard 3.0 and iCalendar (RFC 6350 / RFC 5545). */
export function escapeVText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

export interface VCardInput {
  firstName: string;
  lastName: string;
  organization: string;
  title: string;
  phone: string;
  mobile: string;
  email: string;
  website: string;
  street: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
  note: string;
}

export function vcardPayload(v: VCardInput): string {
  const e = escapeVText;
  const fullName = [v.firstName, v.lastName].filter(Boolean).join(" ") || v.organization;
  const lines = ["BEGIN:VCARD", "VERSION:3.0", `N:${e(v.lastName)};${e(v.firstName)};;;`, `FN:${e(fullName)}`];
  if (v.organization) lines.push(`ORG:${e(v.organization)}`);
  if (v.title) lines.push(`TITLE:${e(v.title)}`);
  if (v.mobile) lines.push(`TEL;TYPE=CELL:${v.mobile}`);
  if (v.phone) lines.push(`TEL;TYPE=WORK,VOICE:${v.phone}`);
  if (v.email) lines.push(`EMAIL;TYPE=INTERNET:${v.email}`);
  if (v.website) lines.push(`URL:${v.website}`);
  if (v.street || v.city || v.region || v.postalCode || v.country) {
    lines.push(`ADR;TYPE=WORK:;;${e(v.street)};${e(v.city)};${e(v.region)};${e(v.postalCode)};${e(v.country)}`);
  }
  if (v.note) lines.push(`NOTE:${e(v.note)}`);
  lines.push("END:VCARD");
  return lines.join("\r\n");
}

export function mailtoPayload(to: string, subject: string, body: string): string {
  const params: string[] = [];
  if (subject) params.push(`subject=${encodeURIComponent(subject)}`);
  if (body) params.push(`body=${encodeURIComponent(body)}`);
  return `mailto:${to}${params.length ? `?${params.join("&")}` : ""}`;
}

/** Strips formatting characters but never adds or guesses a country code. */
export function cleanPhoneNumber(input: string): string {
  const trimmed = input.trim();
  const plus = trimmed.startsWith("+") ? "+" : "";
  return plus + trimmed.replace(/[^\d]/g, "");
}

export function telPayload(phone: string): string {
  return `tel:${phone}`;
}

export function smsPayload(phone: string, message: string): string {
  // SMSTO: is understood by iOS, Android and most scanner apps; it keeps the message intact.
  return message ? `SMSTO:${phone}:${message}` : `SMSTO:${phone}`;
}

export function whatsappPayload(internationalDigits: string, message: string): string {
  return `https://wa.me/${internationalDigits}${message ? `?text=${encodeURIComponent(message)}` : ""}`;
}

/** Formats a Date as an iCalendar UTC date-time (YYYYMMDDTHHMMSSZ). */
export function icsUtc(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

export function icsDate(isoDate: string): string {
  return isoDate.replace(/-/g, "");
}

export interface EventInput {
  title: string;
  location: string;
  description: string;
  /** Inclusive start, as Date (timed) or YYYY-MM-DD (all-day). */
  start: Date | string;
  /** Exclusive end, as Date (timed) or YYYY-MM-DD (all-day, already the following day). */
  end: Date | string;
}

export function eventPayload(ev: EventInput): string {
  const e = escapeVText;
  const lines = ["BEGIN:VEVENT", `SUMMARY:${e(ev.title)}`];
  if (typeof ev.start === "string" && typeof ev.end === "string") {
    lines.push(`DTSTART;VALUE=DATE:${icsDate(ev.start)}`, `DTEND;VALUE=DATE:${icsDate(ev.end)}`);
  } else if (ev.start instanceof Date && ev.end instanceof Date) {
    lines.push(`DTSTART:${icsUtc(ev.start)}`, `DTEND:${icsUtc(ev.end)}`);
  }
  if (ev.location) lines.push(`LOCATION:${e(ev.location)}`);
  if (ev.description) lines.push(`DESCRIPTION:${e(ev.description)}`);
  lines.push("END:VEVENT");
  return lines.join("\r\n");
}

export type MapFormat = "google" | "apple" | "geo";

export function locationPayload(lat: number, lng: number, format: MapFormat, label: string): string {
  const coords = `${lat},${lng}`;
  switch (format) {
    case "google":
      return `https://www.google.com/maps/search/?api=1&query=${coords}`;
    case "apple":
      return `https://maps.apple.com/?ll=${coords}&q=${encodeURIComponent(label || "Pinned location")}`;
    case "geo":
      return label ? `geo:${coords}?q=${coords}(${encodeURIComponent(label)})` : `geo:${coords}`;
  }
}

/** Validates an IBAN with the ISO 13616 mod-97 checksum. */
export function isValidIban(input: string): boolean {
  const iban = input.replace(/\s+/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (const ch of rearranged) {
    const value = ch >= "A" && ch <= "Z" ? String(ch.charCodeAt(0) - 55) : ch;
    for (const digit of value) remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder === 1;
}

/** EPC069-12 "SEPA Credit Transfer" QR payload (a.k.a. GiroCode), version 002, UTF-8. */
export function epcPayload(input: { name: string; iban: string; bic: string; amount: string; reference: string }): string {
  const amount = input.amount ? `EUR${Number(input.amount).toFixed(2)}` : "";
  return [
    "BCD",
    "002",
    "1",
    "SCT",
    input.bic.replace(/\s+/g, "").toUpperCase(),
    input.name,
    input.iban.replace(/\s+/g, "").toUpperCase(),
    amount,
    "",
    "",
    input.reference,
  ]
    .join("\n")
    .replace(/\n+$/, "");
}
