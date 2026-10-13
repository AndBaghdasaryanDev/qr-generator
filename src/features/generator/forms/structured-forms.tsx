"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { SelectField, TextAreaField, TextField } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
import { Switch } from "@/components/ui/switch";
import { getSocialPlatform, SOCIAL_PLATFORMS } from "@/lib/payloads/social";
import { bind, type FormApi } from "./form-api";

export function WifiForm({ api }: { api: FormApi<"wifi"> }) {
  const [showPassword, setShowPassword] = useState(false);
  const needsPassword = api.values.security !== "nopass";
  return (
    <div className="grid gap-4">
      <TextField label="Network name (SSID)" autoComplete="off" placeholder="Cafe Guest" {...bind(api, "ssid")} />
      <Segmented
        label="Security"
        value={api.values.security}
        onChange={(v) => api.set("security", v)}
        options={[
          { value: "WPA", label: "WPA/WPA2/WPA3" },
          { value: "WEP", label: "WEP" },
          { value: "nopass", label: "None" },
        ]}
      />
      {needsPassword && (
        <div className="relative">
          <TextField
            label="Password"
            type={showPassword ? "text" : "password"}
            autoComplete="off"
            spellCheck={false}
            style={{ paddingRight: "2.75rem" }}
            hint="Stays in your browser — it's only written into the QR code."
            {...bind(api, "password")}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            aria-pressed={showPassword}
            className="absolute top-[30px] right-1 grid size-8 place-items-center rounded-lg text-subtle hover:text-fg"
          >
            {showPassword ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
          </button>
        </div>
      )}
      <Switch
        label="Hidden network"
        description="Turn on if the network doesn't broadcast its name."
        checked={api.values.hidden}
        onCheckedChange={(v) => api.set("hidden", v)}
      />
    </div>
  );
}

export function VCardForm({ api }: { api: FormApi<"vcard"> }) {
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="First name" autoComplete="given-name" {...bind(api, "firstName")} />
        <TextField label="Last name" autoComplete="family-name" {...bind(api, "lastName")} />
        <TextField label="Organization" optional autoComplete="organization" placeholder="Business name" {...bind(api, "organization")} />
        <TextField label="Job title" optional autoComplete="organization-title" {...bind(api, "title")} />
        <TextField label="Mobile" optional type="tel" inputMode="tel" placeholder="+374 55 123456" {...bind(api, "mobile")} />
        <TextField label="Work phone" optional type="tel" inputMode="tel" {...bind(api, "phone")} />
        <TextField label="Email" optional type="email" inputMode="email" {...bind(api, "email")} />
        <TextField label="Website" optional type="url" inputMode="url" {...bind(api, "website")} />
      </div>
      <details className="group rounded-xl border border-border p-3 open:pb-4">
        <summary className="cursor-pointer text-sm font-medium text-fg select-none">Address & note (optional)</summary>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <TextField label="Street" className="sm:col-span-2" autoComplete="street-address" {...bind(api, "street")} />
          <TextField label="City" autoComplete="address-level2" {...bind(api, "city")} />
          <TextField label="Region / state" autoComplete="address-level1" {...bind(api, "region")} />
          <TextField label="Postal code" autoComplete="postal-code" {...bind(api, "postalCode")} />
          <TextField label="Country" autoComplete="country-name" {...bind(api, "country")} />
          <TextAreaField label="Note" className="sm:col-span-2" rows={2} {...bind(api, "note")} />
        </div>
      </details>
    </div>
  );
}

export function SocialForm({ api }: { api: FormApi<"social"> }) {
  const platform = getSocialPlatform(api.values.platform);
  return (
    <div className="grid gap-4 sm:grid-cols-[minmax(0,14rem)_1fr]">
      <SelectField label="Network" value={api.values.platform} onChange={(e) => api.set("platform", e.target.value)}>
        {SOCIAL_PLATFORMS.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
          </option>
        ))}
      </SelectField>
      <TextField
        label={platform.profileUrl ? "Username or profile link" : "Profile link"}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        placeholder={platform.profileUrl ? "@username" : "https://…"}
        hint={platform.usernameHint}
        {...bind(api, "handle")}
      />
    </div>
  );
}

export function EventForm({ api }: { api: FormApi<"event"> }) {
  const inputType = api.values.allDay ? "date" : "datetime-local";
  return (
    <div className="grid gap-4">
      <TextField label="Event title" placeholder="Product launch" {...bind(api, "title")} />
      <Switch
        label="All-day event"
        checked={api.values.allDay}
        onCheckedChange={(v) => {
          api.set("allDay", v);
          // Convert between "YYYY-MM-DD" and "YYYY-MM-DDTHH:mm" so values stay valid.
          for (const field of ["start", "end"] as const) {
            const current = api.values[field];
            if (!current) continue;
            api.set(field, v ? current.slice(0, 10) : `${current.slice(0, 10)}T09:00`);
          }
        }}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Starts" type={inputType} {...bind(api, "start")} />
        <TextField
          label="Ends"
          optional
          type={inputType}
          hint={api.values.allDay ? "Leave empty for a one-day event." : "Leave empty for a one-hour event."}
          {...bind(api, "end")}
        />
      </div>
      <TextField label="Location" optional placeholder="Address or meeting link" {...bind(api, "location")} />
      <TextAreaField label="Description" optional rows={3} {...bind(api, "description")} />
    </div>
  );
}

export function PaymentForm({ api }: { api: FormApi<"payment"> }) {
  return (
    <div className="grid gap-4">
      <Segmented
        label="Payment type"
        value={api.values.method}
        onChange={(v) => api.set("method", v)}
        options={[
          { value: "link", label: "Payment link" },
          { value: "sepa", label: "SEPA transfer (EU)" },
        ]}
      />
      {api.values.method === "link" ? (
        <TextField
          label="Payment link"
          type="url"
          inputMode="url"
          placeholder="https://paypal.me/yourname or https://buy.stripe.com/…"
          hint="Use a link from your payment provider (PayPal.me, Stripe Payment Links, Revolut, etc.). Payment happens on their site."
          {...bind(api, "url")}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Recipient name" className="sm:col-span-2" {...bind(api, "name")} />
          <TextField label="IBAN" autoCapitalize="characters" spellCheck={false} placeholder="DE89 3704 0044 0532 0130 00" {...bind(api, "iban")} />
          <TextField label="BIC" optional autoCapitalize="characters" spellCheck={false} {...bind(api, "bic")} />
          <TextField label="Amount (EUR)" optional inputMode="decimal" placeholder="12.50" {...bind(api, "amount")} />
          <TextField label="Reference" optional placeholder="Invoice 42" {...bind(api, "reference")} />
        </div>
      )}
    </div>
  );
}
