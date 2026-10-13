import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { VideoPlayer } from "@/features/dynamic/video-player";
import { configuredOrigin } from "@/lib/site";
import { getDb } from "@/server/db/client";
import { getPlayerData } from "@/server/dynamic-qr/service";

export const metadata: Metadata = {
  title: "Watch video",
  robots: { index: false, follow: false },
};

async function Player({ params }: { params: PageProps<"/watch/[code]">["params"] }) {
  const { code } = await params;
  // Everything below is request-time work (the database driver uses clocks and sockets).
  await connection();
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost";
  const proto = requestHeaders.get("x-forwarded-proto") ?? "http";
  const origin = configuredOrigin() ?? `${proto}://${host}`;

  let data: Awaited<ReturnType<typeof getPlayerData>>;
  try {
    data = await getPlayerData(await getDb(), code, origin);
  } catch (error) {
    console.error("Player lookup failed", error);
    return (
      <p role="alert" className="text-muted">
        This video can&apos;t be loaded right now. Please try again in a moment.
      </p>
    );
  }
  if (!data) notFound();

  return (
    <>
      <h1 className="mb-4 text-xl font-semibold sm:text-2xl">{data.name}</h1>
      <VideoPlayer src={data.url} title={data.name} />
    </>
  );
}

export default function WatchPage({ params }: PageProps<"/watch/[code]">) {
  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <Suspense fallback={<div className="aspect-video w-full animate-pulse rounded-2xl bg-surface-muted" />}>
        <Player params={params} />
      </Suspense>
    </div>
  );
}
