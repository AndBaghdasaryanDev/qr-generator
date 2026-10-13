import type { Metadata } from "next";
import { Card } from "@/components/ui/card";
import { Generator } from "@/features/generator/generator";
import { Hero } from "@/features/marketing/hero";
import { siteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "Video QR Code Generator — YouTube, Vimeo, MP4",
  description:
    "Turn any video link into a QR code: YouTube videos and Shorts, Vimeo, TikTok, Instagram Reels or direct MP4/WebM files. Static or editable dynamic codes, free.",
  alternates: { canonical: "/video" },
};

const STEPS = [
  { title: "Paste a link or upload", text: "YouTube, Shorts, Vimeo, TikTok, Reels, Loom, any video page — or upload an MP4, WebM or MOV file." },
  { title: "Check the detection", text: "We show what kind of video it is and the exact link the code will open. Nothing is fetched by our server." },
  { title: "Pick static or dynamic", text: "Static encodes the link itself. Dynamic lets you swap the video later without reprinting." },
  { title: "Design & download", text: "Colors, shapes, a logo — then PNG, SVG or JPEG at print resolution." },
  { title: "Scan & watch", text: "Phones open the YouTube/Vimeo app or the browser's video player." },
];

export default function VideoPage() {
  return (
    <>
      <Hero
        eyebrow="Video QR codes · free"
        title={
          <>
            Point a QR code at <span className="text-primary">any video</span>.
          </>
        }
        description="Share a YouTube video, a Short, a product demo or your own video file with a single scan. Paste a link to where your video lives, or upload the file and we'll host it with a player page."
        sampleUrl={`${siteUrl()}/video`}
        primaryCta={{ href: "#generator", label: "Create a video QR code" }}
      />

      <section id="generator" aria-labelledby="generator-heading" className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <h2 id="generator-heading" className="sr-only">
          Video QR code generator
        </h2>
        <Generator initialType="video" />
      </section>

      <section aria-labelledby="video-how" className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:px-8">
        <h2 id="video-how" className="text-3xl font-bold tracking-tight">
          How video QR codes work
        </h2>
        <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {STEPS.map((step, i) => (
            <li key={step.title}>
              <Card className="h-full p-5">
                <span className="grid size-8 place-items-center rounded-full bg-primary-soft text-sm font-semibold text-primary-soft-fg">
                  {i + 1}
                </span>
                <h3 className="mt-3 font-semibold">{step.title}</h3>
                <p className="mt-1 text-sm text-muted">{step.text}</p>
              </Card>
            </li>
          ))}
        </ol>

        <div className="mt-10 grid gap-4 lg:grid-cols-3">
          <Card className="p-6">
            <h3 className="font-semibold">YouTube & platforms</h3>
            <p className="mt-2 text-sm text-muted">
              Links are cleaned of tracking parameters and shortened (e.g. <code className="font-mono">youtu.be/ID</code>)
              so the code stays easy to scan. Start times and playlists are kept. Shorts stay Shorts.
            </p>
          </Card>
          <Card className="p-6">
            <h3 className="font-semibold">Direct video files</h3>
            <p className="mt-2 text-sm text-muted">
              MP4 (H.264) plays on virtually every phone. The file must be publicly reachable and its server must allow
              browser playback. With a dynamic code you can show it in a clean player page instead of the raw file.
            </p>
          </Card>
          <Card className="p-6">
            <h3 className="font-semibold">About autoplay</h3>
            <p className="mt-2 text-sm text-muted">
              Phones block videos from playing with sound until the viewer taps play. Our player page always shows
              controls and never promises sound-on autoplay — that decision belongs to the viewer&apos;s browser.
            </p>
          </Card>
        </div>
      </section>
    </>
  );
}
