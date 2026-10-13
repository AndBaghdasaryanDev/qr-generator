import { z } from "zod";
import { classifyVideoUrl, type VideoInfo } from "@/lib/video/classify";
import { parseWebUrl } from "@/lib/validation/url";
import {
  cleanPhoneNumber,
  epcPayload,
  eventPayload,
  isValidIban,
  locationPayload,
  mailtoPayload,
  smsPayload,
  telPayload,
  vcardPayload,
  whatsappPayload,
  wifiPayload,
} from "./formats";
import { SOCIAL_PLATFORM_IDS, resolveSocialProfile } from "./social";

export const QR_TYPES = [
  "url",
  "video",
  "text",
  "email",
  "phone",
  "sms",
  "whatsapp",
  "wifi",
  "vcard",
  "location",
  "social",
  "event",
  "app",
  "payment",
] as const;
export type QrType = (typeof QR_TYPES)[number];

export const QR_TYPE_META: Record<QrType, { label: string; description: string }> = {
  url: { label: "Website", description: "Open any web page" },
  video: { label: "Video", description: "YouTube, Vimeo, MP4 and more" },
  text: { label: "Text", description: "Plain text, any language" },
  email: { label: "Email", description: "Pre-filled email draft" },
  phone: { label: "Phone", description: "Start a phone call" },
  sms: { label: "SMS", description: "Pre-filled text message" },
  whatsapp: { label: "WhatsApp", description: "Open a WhatsApp chat" },
  wifi: { label: "Wi-Fi", description: "Join a network instantly" },
  vcard: { label: "Contact card", description: "vCard for people & businesses" },
  location: { label: "Location", description: "Coordinates on a map" },
  social: { label: "Social profile", description: "Instagram, TikTok, LinkedIn…" },
  event: { label: "Calendar event", description: "Add an event to a calendar" },
  app: { label: "App download", description: "App Store or Google Play" },
  payment: { label: "Payment", description: "Payment link or SEPA transfer" },
};

/* ------------------------------------------------------------------ */
/* Reusable field schemas                                              */
/* ------------------------------------------------------------------ */

const required = (message: string) => z.string().trim().min(1, message);
const optionalText = (max: number, label: string) =>
  z.string().trim().max(max, `${label} can be at most ${max} characters.`);

const webUrlField = z.string().transform((value, ctx) => {
  const parsed = parseWebUrl(value);
  if (!parsed.ok) {
    ctx.addIssue({ code: "custom", message: parsed.error });
    return z.NEVER;
  }
  return parsed.href;
});

const optionalWebUrl = z.string().transform((value, ctx) => {
  if (!value.trim()) return "";
  const parsed = parseWebUrl(value);
  if (!parsed.ok) {
    ctx.addIssue({ code: "custom", message: parsed.error });
    return z.NEVER;
  }
  return parsed.href;
});

const emailField = required("Enter an email address.").pipe(z.email("Enter a valid email address."));
const optionalEmail = z
  .string()
  .trim()
  .refine((v) => v === "" || z.email().safeParse(v).success, "Enter a valid email address.");

/** Any dialable number: keeps +, strips formatting, never invents a country code. */
const phoneField = required("Enter a phone number.")
  .transform(cleanPhoneNumber)
  .refine((v) => /^\+?\d{3,15}$/.test(v), "Enter a phone number with 3–15 digits.");

const optionalPhone = z
  .string()
  .transform(cleanPhoneNumber)
  .refine((v) => v === "" || /^\+?\d{3,15}$/.test(v), "Enter a phone number with 3–15 digits.");

/** wa.me requires the full international number without + or 00. */
const internationalPhone = required("Enter a phone number.").transform((value, ctx) => {
  const trimmed = value.trim();
  const cleaned = cleanPhoneNumber(trimmed.replace(/^00/, "+"));
  if (!cleaned.startsWith("+")) {
    ctx.addIssue({
      code: "custom",
      message: "Include the country code, e.g. +374 55 123456. WhatsApp needs the full international number.",
    });
    return z.NEVER;
  }
  const digits = cleaned.slice(1);
  if (!/^[1-9]\d{6,14}$/.test(digits)) {
    ctx.addIssue({ code: "custom", message: "Enter a valid international number (7–15 digits)." });
    return z.NEVER;
  }
  return digits;
});

const coordinate = (label: string, limit: number) =>
  required(`Enter the ${label}.`)
    .refine((v) => /^-?\d{1,3}(\.\d+)?$/.test(v), `The ${label} must be a decimal number, e.g. 40.1792.`)
    .transform(Number)
    .refine((v) => Math.abs(v) <= limit, `The ${label} must be between -${limit} and ${limit}.`)
    .transform((v) => Math.round(v * 1e6) / 1e6);

/* ------------------------------------------------------------------ */
/* Per-type schemas                                                    */
/* ------------------------------------------------------------------ */

export const formSchemas = {
  url: z.object({ url: webUrlField }),
  video: z
    .object({ source: z.enum(["link", "upload"]), url: z.string() })
    .superRefine((v, ctx) => {
      if (v.source === "link" && !v.url.trim()) ctx.addIssue({ code: "custom", path: ["url"], message: "Paste a video link." });
    }),
  text: z.object({ text: z.string().refine((v) => v.trim().length > 0, "Enter some text.") }),
  email: z.object({
    to: emailField,
    subject: optionalText(200, "Subject"),
    body: optionalText(1000, "Message"),
  }),
  phone: z.object({ phone: phoneField }),
  sms: z.object({ phone: phoneField, message: optionalText(500, "Message") }),
  whatsapp: z.object({ phone: internationalPhone, message: optionalText(500, "Message") }),
  wifi: z
    .object({
      ssid: required("Enter the network name.").max(32, "Network names are at most 32 characters."),
      security: z.enum(["WPA", "WEP", "nopass"]),
      password: z.string(),
      hidden: z.boolean(),
    })
    .superRefine((v, ctx) => {
      if (v.security === "WPA" && !(/^.{8,63}$/u.test(v.password) || /^[0-9a-fA-F]{64}$/.test(v.password))) {
        ctx.addIssue({ code: "custom", path: ["password"], message: "WPA passwords are 8–63 characters." });
      }
      if (v.security === "WEP" && !/^(.{5}|.{13}|[0-9a-fA-F]{10}|[0-9a-fA-F]{26})$/u.test(v.password)) {
        ctx.addIssue({
          code: "custom",
          path: ["password"],
          message: "WEP keys are 5 or 13 characters (or 10/26 hex digits).",
        });
      }
    }),
  vcard: z
    .object({
      firstName: optionalText(100, "First name"),
      lastName: optionalText(100, "Last name"),
      organization: optionalText(150, "Organization"),
      title: optionalText(100, "Job title"),
      phone: optionalPhone,
      mobile: optionalPhone,
      email: optionalEmail,
      website: optionalWebUrl,
      street: optionalText(150, "Street"),
      city: optionalText(100, "City"),
      region: optionalText(100, "Region"),
      postalCode: optionalText(20, "Postal code"),
      country: optionalText(100, "Country"),
      note: optionalText(300, "Note"),
    })
    .superRefine((v, ctx) => {
      if (!v.firstName && !v.lastName && !v.organization) {
        ctx.addIssue({ code: "custom", path: ["firstName"], message: "Enter a name or an organization." });
      }
    }),
  location: z.object({
    latitude: coordinate("latitude", 90),
    longitude: coordinate("longitude", 180),
    label: optionalText(100, "Label"),
    format: z.enum(["google", "apple", "geo"]),
  }),
  social: z.object({ platform: z.enum(SOCIAL_PLATFORM_IDS), handle: z.string() }),
  event: z
    .object({
      title: required("Enter an event title.").max(150, "Titles can be at most 150 characters."),
      location: optionalText(200, "Location"),
      description: optionalText(500, "Description"),
      allDay: z.boolean(),
      start: required("Choose a start date."),
      end: z.string().trim(),
    })
    .superRefine((v, ctx) => {
      const pattern = v.allDay ? /^\d{4}-\d{2}-\d{2}$/ : /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
      if (!pattern.test(v.start) || Number.isNaN(new Date(v.start).getTime())) {
        ctx.addIssue({ code: "custom", path: ["start"], message: "Choose a valid start." });
        return;
      }
      if (v.end && (!pattern.test(v.end) || Number.isNaN(new Date(v.end).getTime()))) {
        ctx.addIssue({ code: "custom", path: ["end"], message: "Choose a valid end." });
        return;
      }
      if (v.end && v.end < v.start) {
        ctx.addIssue({ code: "custom", path: ["end"], message: "The end must be after the start." });
      }
    }),
  app: z
    .object({ store: z.enum(["apple", "google", "other"]), url: webUrlField })
    .superRefine((v, ctx) => {
      const parsed = parseWebUrl(v.url);
      if (!parsed.ok) return;
      const host = parsed.url.hostname;
      if (v.store === "apple" && host !== "apps.apple.com" && host !== "itunes.apple.com") {
        ctx.addIssue({ code: "custom", path: ["url"], message: "App Store links start with https://apps.apple.com/." });
      }
      if (v.store === "google" && host !== "play.google.com") {
        ctx.addIssue({ code: "custom", path: ["url"], message: "Google Play links start with https://play.google.com/." });
      }
    }),
  payment: z
    .object({
      method: z.enum(["link", "sepa"]),
      url: z.string(),
      name: z.string().trim(),
      iban: z.string().trim(),
      bic: z.string().trim(),
      amount: z.string().trim(),
      reference: z.string().trim(),
    })
    .superRefine((v, ctx) => {
      if (v.method === "link") {
        const parsed = parseWebUrl(v.url);
        if (!parsed.ok) ctx.addIssue({ code: "custom", path: ["url"], message: parsed.error });
        else if (parsed.url.protocol !== "https:") {
          ctx.addIssue({ code: "custom", path: ["url"], message: "Payment links must use https://." });
        }
        return;
      }
      if (!v.name) ctx.addIssue({ code: "custom", path: ["name"], message: "Enter the recipient's name." });
      else if (v.name.length > 70) ctx.addIssue({ code: "custom", path: ["name"], message: "Names are at most 70 characters." });
      if (!v.iban) ctx.addIssue({ code: "custom", path: ["iban"], message: "Enter the recipient's IBAN." });
      else if (!isValidIban(v.iban)) ctx.addIssue({ code: "custom", path: ["iban"], message: "This IBAN isn't valid. Check for typos." });
      if (v.bic && !/^[A-Za-z]{6}[A-Za-z0-9]{2}([A-Za-z0-9]{3})?$/.test(v.bic.replace(/\s+/g, ""))) {
        ctx.addIssue({ code: "custom", path: ["bic"], message: "BICs are 8 or 11 characters." });
      }
      if (v.amount) {
        const n = Number(v.amount);
        if (!/^\d{1,9}(\.\d{1,2})?$/.test(v.amount) || n < 0.01) {
          ctx.addIssue({ code: "custom", path: ["amount"], message: "Enter an amount such as 12.50 (max 2 decimals)." });
        }
      }
      if (v.reference.length > 140) {
        ctx.addIssue({ code: "custom", path: ["reference"], message: "References are at most 140 characters." });
      }
    }),
} satisfies Record<QrType, z.ZodType>;

export type FormValuesByType = { [K in QrType]: z.input<(typeof formSchemas)[K]> };
export type AnyFormValues = FormValuesByType[QrType];

export const DEFAULT_VALUES: FormValuesByType = {
  url: { url: "" },
  video: { source: "link", url: "" },
  text: { text: "" },
  email: { to: "", subject: "", body: "" },
  phone: { phone: "" },
  sms: { phone: "", message: "" },
  whatsapp: { phone: "", message: "" },
  wifi: { ssid: "", security: "WPA", password: "", hidden: false },
  vcard: {
    firstName: "",
    lastName: "",
    organization: "",
    title: "",
    phone: "",
    mobile: "",
    email: "",
    website: "",
    street: "",
    city: "",
    region: "",
    postalCode: "",
    country: "",
    note: "",
  },
  location: { latitude: "", longitude: "", label: "", format: "google" },
  social: { platform: "instagram", handle: "" },
  event: { title: "", location: "", description: "", allDay: false, start: "", end: "" },
  app: { store: "apple", url: "" },
  payment: { method: "link", url: "", name: "", iban: "", bic: "", amount: "", reference: "" },
};

/* ------------------------------------------------------------------ */
/* Building                                                            */
/* ------------------------------------------------------------------ */

export type FieldErrors = Record<string, string>;

export type PayloadResult =
  | {
      ok: true;
      payload: string;
      /** Set when the payload is an http(s) link, which makes dynamic (redirect) mode possible. */
      webUrl: string | null;
      notes: string[];
      video: VideoInfo | null;
    }
  | {
      ok: false;
      errors: FieldErrors;
      /** Fields that are required but still empty — shown gently, not as errors. */
      missing: string[];
    };

const success = (payload: string, notes: string[] = [], video: VideoInfo | null = null): PayloadResult => ({
  ok: true,
  payload,
  webUrl: /^https?:\/\//i.test(payload) ? payload : null,
  notes,
  video,
});

const failure = (errors: FieldErrors, missing: string[] = []): PayloadResult => ({ ok: false, errors, missing });

function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function buildFromData<K extends QrType>(type: K, data: z.output<(typeof formSchemas)[K]>): PayloadResult {
  // Narrowing generics on `type` is not possible in TS, so each branch re-asserts its data shape.
  switch (type) {
    case "url": {
      const v = data as z.output<typeof formSchemas.url>;
      return success(v.url, v.url.startsWith("http:") ? ["This link uses http://. Use https:// if the site supports it."] : []);
    }
    case "video": {
      const v = data as z.output<typeof formSchemas.video>;
      // Uploaded videos get their (dynamic) link from the server once the upload finishes.
      if (v.source === "upload") return failure({ upload: "Upload a video file." }, ["upload"]);
      const result = classifyVideoUrl(v.url);
      if (!result.ok) return failure({ url: result.error });
      return success(result.info.url, [], result.info);
    }
    case "text":
      return success((data as z.output<typeof formSchemas.text>).text);
    case "email": {
      const v = data as z.output<typeof formSchemas.email>;
      return success(mailtoPayload(v.to, v.subject, v.body));
    }
    case "phone": {
      const v = data as z.output<typeof formSchemas.phone>;
      return success(
        telPayload(v.phone),
        v.phone.startsWith("+") ? [] : ["No country code: the number is dialed as a local number from the scanner's country."],
      );
    }
    case "sms": {
      const v = data as z.output<typeof formSchemas.sms>;
      return success(smsPayload(v.phone, v.message));
    }
    case "whatsapp": {
      const v = data as z.output<typeof formSchemas.whatsapp>;
      return success(whatsappPayload(v.phone, v.message));
    }
    case "wifi": {
      const v = data as z.output<typeof formSchemas.wifi>;
      return success(
        wifiPayload(v),
        v.security === "nopass" ? [] : ["The password is stored inside the QR code. Anyone who scans it can read it."],
      );
    }
    case "vcard":
      return success(vcardPayload(data as z.output<typeof formSchemas.vcard>));
    case "location": {
      const v = data as z.output<typeof formSchemas.location>;
      return success(
        locationPayload(v.latitude, v.longitude, v.format, v.label),
        v.format === "geo" ? ["geo: links open map apps on Android; iPhone camera support is limited."] : [],
      );
    }
    case "social": {
      const v = data as z.output<typeof formSchemas.social>;
      const result = resolveSocialProfile(v.platform, v.handle);
      if (!result.ok) return failure({ handle: result.error }, v.handle.trim() ? [] : ["handle"]);
      return success(result.url);
    }
    case "event": {
      const v = data as z.output<typeof formSchemas.event>;
      if (v.allDay) {
        const end = addDays(v.end || v.start, 1);
        return success(eventPayload({ ...v, start: v.start, end }));
      }
      const start = new Date(v.start);
      const end = v.end ? new Date(v.end) : new Date(start.getTime() + 60 * 60 * 1000);
      return success(eventPayload({ ...v, start, end }), [
        "Times are converted to UTC using your device's time zone, so they show correctly everywhere.",
      ]);
    }
    case "app": {
      const v = data as z.output<typeof formSchemas.app>;
      return success(v.url, [
        "A single static code can hold one store link. To serve iPhone and Android users, print one code per store or link to a page listing both.",
      ]);
    }
    case "payment": {
      const v = data as z.output<typeof formSchemas.payment>;
      if (v.method === "link") {
        const parsed = parseWebUrl(v.url);
        return parsed.ok ? success(parsed.href) : failure({ url: parsed.error });
      }
      return success(epcPayload(v), [
        "EPC (SEPA) payment codes are read by many European banking apps. Payment happens in the scanner's bank app; this site never handles money.",
      ]);
    }
  }
  return failure({ form: "Unsupported QR type." });
}

/** Union-friendly entry point for callers holding a QrType that isn't a literal. */
export function buildPayloadFor(type: QrType, values: AnyFormValues): PayloadResult {
  return buildPayload(type, values as FormValuesByType[typeof type]);
}

/** Validates the form values for a QR type and builds the exact string to encode. */
export function buildPayload<K extends QrType>(type: K, values: FormValuesByType[K]): PayloadResult {
  const parsed = formSchemas[type].safeParse(values);
  if (!parsed.success) {
    const errors: FieldErrors = {};
    const missing: string[] = [];
    const raw = values as Record<string, unknown>;
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      if (errors[key]) continue;
      errors[key] = issue.message;
      const value = raw[key];
      if (typeof value === "string" && value.trim() === "") missing.push(key);
    }
    return failure(errors, missing);
  }
  return buildFromData(type, parsed.data as z.output<(typeof formSchemas)[K]>);
}
