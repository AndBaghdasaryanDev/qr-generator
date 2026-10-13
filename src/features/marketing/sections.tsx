import { Check, Cloud, HardDrive, Minus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { QR_TYPE_ICONS } from "@/features/generator/type-icons";
import { QR_TYPE_META, QR_TYPES } from "@/lib/payloads/definitions";

const COMPARISON: Array<{ feature: string; staticValue: boolean | string; dynamicValue: boolean | string }> = [
  { feature: "Account required", staticValue: "No", dynamicValue: "No" },
  { feature: "Works if this website goes offline", staticValue: true, dynamicValue: false },
  { feature: "Change destination after printing", staticValue: false, dynamicValue: true },
  { feature: "Scan count", staticValue: false, dynamicValue: true },
  { feature: "Pause or delete later", staticValue: false, dynamicValue: true },
  { feature: "Content types", staticValue: "All 14 types", dynamicValue: "Web links (incl. video)" },
  { feature: "Where it's created", staticValue: "Your browser", dynamicValue: "Short link on our server" },
];

function Cell({ value }: { value: boolean | string }) {
  if (typeof value === "string") return <span>{value}</span>;
  return value ? (
    <Check className="mx-auto size-5 text-success" aria-label="Yes" />
  ) : (
    <Minus className="mx-auto size-5 text-subtle" aria-label="No" />
  );
}

export function HowItWorks() {
  return (
    <section id="how-it-works" aria-labelledby="how-heading" className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
      <div className="max-w-2xl">
        <h2 id="how-heading" className="text-3xl font-bold tracking-tight">
          Static or dynamic?
        </h2>
        <p className="mt-3 text-muted">
          Both are free. Static codes are self-contained; dynamic codes trade that independence for the ability to edit
          the destination later.
        </p>
      </div>
      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <Card className="p-6">
          <HardDrive className="size-6 text-primary" aria-hidden />
          <h3 className="mt-3 text-lg font-semibold">Static QR code</h3>
          <p className="mt-2 text-sm text-muted">
            Your link or data is written directly into the pattern. It&apos;s created locally, needs no database and keeps
            working as long as the destination exists — even if this site disappears. To change it, you print a new code.
          </p>
        </Card>
        <Card className="p-6">
          <Cloud className="size-6 text-primary" aria-hidden />
          <h3 className="mt-3 text-lg font-semibold">Dynamic QR code</h3>
          <p className="mt-2 text-sm text-muted">
            The code holds a short link like <code className="font-mono text-fg">/r/AbC123xYz9</code>. When scanned, our
            server forwards visitors to your current destination, which you can change any time with your private
            management link. It only works while this service and its database are online.
          </p>
        </Card>
      </div>
      <div className="mt-6 overflow-x-auto rounded-2xl border border-border bg-surface">
        <table className="w-full min-w-[520px] text-sm">
          <caption className="sr-only">Static and dynamic QR codes compared</caption>
          <thead className="bg-surface-muted text-left">
            <tr>
              <th scope="col" className="px-4 py-3 font-semibold">
                Feature
              </th>
              <th scope="col" className="px-4 py-3 text-center font-semibold">
                Static
              </th>
              <th scope="col" className="px-4 py-3 text-center font-semibold">
                Dynamic
              </th>
            </tr>
          </thead>
          <tbody>
            {COMPARISON.map((row) => (
              <tr key={row.feature} className="border-t border-border">
                <th scope="row" className="px-4 py-3 text-left font-normal text-muted">
                  {row.feature}
                </th>
                <td className="px-4 py-3 text-center">
                  <Cell value={row.staticValue} />
                </td>
                <td className="px-4 py-3 text-center">
                  <Cell value={row.dynamicValue} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function SupportedTypes() {
  return (
    <section aria-labelledby="types-heading" className="border-y border-border bg-surface">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <h2 id="types-heading" className="text-3xl font-bold tracking-tight">
          14 kinds of QR code, all free
        </h2>
        <p className="mt-3 max-w-2xl text-muted">
          Each type has its own form that validates your input and builds the exact format phone cameras expect.
        </p>
        <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {QR_TYPES.map((type) => {
            const Icon = QR_TYPE_ICONS[type];
            return (
              <li key={type} className="flex items-start gap-3 rounded-xl border border-border p-4">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary-soft-fg">
                  <Icon className="size-4.5" aria-hidden />
                </span>
                <span>
                  <span className="block font-medium">{QR_TYPE_META[type].label}</span>
                  <span className="block text-sm text-muted">{QR_TYPE_META[type].description}</span>
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

const FAQ: Array<{ q: string; a: string }> = [
  {
    q: "Is it really free? Are there limits?",
    a: "Yes. This app sets no quota on QR generation: static codes are made in your browser, so they cost nothing to produce. Dynamic codes use a server, so creating them is rate-limited per visitor to prevent abuse, and the operator's hosting and database plan ultimately limit how many can be stored.",
  },
  {
    q: "Do the QR codes expire?",
    a: "Static codes never expire — the data is inside the code. Dynamic codes work as long as this service is running and you haven't paused or deleted them.",
  },
  {
    q: "What happens to my data?",
    a: "Static codes, Wi-Fi passwords and logos never leave your browser. For dynamic codes the server stores only the name, destination, design colors, a scan counter and a hashed management key — no IP addresses, locations or device details of the people who scan. Videos you upload are stored until you replace or delete them (or delete the code).",
  },
  {
    q: "How do I edit a dynamic QR code?",
    a: "Use the private management link you get when creating it (it's also saved in your browser's library). Anyone with that link can edit the code, so keep it private. There are no accounts, so a lost link can't be recovered.",
  },
  {
    q: "Why won't my code scan?",
    a: "Common causes: low contrast, light-on-dark colors, too small a print, a missing margin, or a logo that's too large. The generator warns about these, but always test with a couple of phones before printing.",
  },
  {
    q: "Can I make a QR code for a video?",
    a: "Yes — paste a YouTube, Vimeo, TikTok or other video link, or upload your own MP4, WebM or MOV file. Uploaded videos are hosted by this service behind a dynamic code, so you can replace the video later without reprinting.",
  },
];

export function Faq() {
  return (
    <section id="faq" aria-labelledby="faq-heading" className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
      <h2 id="faq-heading" className="text-3xl font-bold tracking-tight">
        Questions & privacy
      </h2>
      <div className="mt-8 divide-y divide-border rounded-2xl border border-border bg-surface">
        {FAQ.map((item) => (
          <details key={item.q} className="group px-5 py-4">
            <summary className="flex cursor-pointer items-center justify-between gap-4 font-medium select-none">
              {item.q}
              <span aria-hidden className="text-subtle transition-transform group-open:rotate-45">
                +
              </span>
            </summary>
            <p className="mt-3 text-sm leading-relaxed text-muted">{item.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
