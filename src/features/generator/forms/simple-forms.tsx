"use client";

import { TextAreaField, TextField, SelectField } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
import { bind, type FormApi } from "./form-api";

export function UrlForm({ api }: { api: FormApi<"url"> }) {
  return (
    <TextField
      label="Website address"
      type="url"
      inputMode="url"
      autoComplete="url"
      placeholder="https://example.com"
      hint="We'll add https:// if you leave it out."
      {...bind(api, "url")}
    />
  );
}

export function TextForm({ api, byteLength }: { api: FormApi<"text">; byteLength: number }) {
  return (
    <TextAreaField
      label="Text"
      rows={5}
      placeholder="Any text, in any language — Բարեւ, こんにちは, 👋"
      hint={`${byteLength.toLocaleString("en-US")} bytes. Long text makes dense codes; for more than a few sentences, link to a web page instead.`}
      {...bind(api, "text")}
    />
  );
}

export function EmailForm({ api }: { api: FormApi<"email"> }) {
  return (
    <div className="grid gap-4">
      <TextField label="Email address" type="email" inputMode="email" autoComplete="email" placeholder="hello@example.com" {...bind(api, "to")} />
      <TextField label="Subject" optional placeholder="Question about…" {...bind(api, "subject")} />
      <TextAreaField label="Message" optional rows={3} {...bind(api, "body")} />
    </div>
  );
}

export function PhoneForm({ api }: { api: FormApi<"phone"> }) {
  return (
    <TextField
      label="Phone number"
      type="tel"
      inputMode="tel"
      autoComplete="tel"
      placeholder="+374 55 123456"
      hint="Include the country code (e.g. +1, +44, +374) so it works from abroad. We never guess it for you."
      {...bind(api, "phone")}
    />
  );
}

export function SmsForm({ api }: { api: FormApi<"sms"> }) {
  return (
    <div className="grid gap-4">
      <TextField label="Phone number" type="tel" inputMode="tel" placeholder="+374 55 123456" {...bind(api, "phone")} />
      <TextAreaField label="Message" optional rows={3} hint="Pre-filled; the sender can still edit it." {...bind(api, "message")} />
    </div>
  );
}

export function WhatsappForm({ api }: { api: FormApi<"whatsapp"> }) {
  return (
    <div className="grid gap-4">
      <TextField
        label="WhatsApp number"
        type="tel"
        inputMode="tel"
        placeholder="+374 55 123456"
        hint="Full international number with country code."
        {...bind(api, "phone")}
      />
      <TextAreaField label="Pre-filled message" optional rows={3} {...bind(api, "message")} />
    </div>
  );
}

export function AppForm({ api }: { api: FormApi<"app"> }) {
  return (
    <div className="grid gap-4">
      <Segmented
        label="Store"
        value={api.values.store}
        onChange={(v) => api.set("store", v)}
        options={[
          { value: "apple", label: "App Store" },
          { value: "google", label: "Google Play" },
          { value: "other", label: "Other" },
        ]}
      />
      <TextField
        label="App link"
        type="url"
        inputMode="url"
        placeholder={
          api.values.store === "apple"
            ? "https://apps.apple.com/app/id123456789"
            : api.values.store === "google"
              ? "https://play.google.com/store/apps/details?id=com.example"
              : "https://example.com/download"
        }
        {...bind(api, "url")}
      />
    </div>
  );
}

export function LocationForm({ api }: { api: FormApi<"location"> }) {
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Latitude" inputMode="decimal" placeholder="40.1792" {...bind(api, "latitude")} />
        <TextField label="Longitude" inputMode="decimal" placeholder="44.4991" {...bind(api, "longitude")} />
      </div>
      <TextField label="Label" optional placeholder="Our office" {...bind(api, "label")} />
      <SelectField
        label="Open with"
        value={api.values.format}
        onChange={(e) => api.set("format", e.target.value)}
        hint="Google Maps links work on every phone. geo: opens the default map app on Android."
      >
        <option value="google">Google Maps link (works everywhere)</option>
        <option value="apple">Apple Maps link</option>
        <option value="geo">geo: coordinates (Android map apps)</option>
      </SelectField>
      <p className="text-xs text-subtle">
        Tip: in Google Maps, long-press a spot to copy its coordinates.
      </p>
    </div>
  );
}
