import type { Metadata } from "next";
import { Suspense } from "react";
import { ManageView } from "@/features/dynamic/manage-view";

export const metadata: Metadata = {
  title: "Manage dynamic QR code",
  robots: { index: false, follow: false },
  // Management pages carry a secret in the fragment; don't leak the path to other sites.
  referrer: "no-referrer",
};

async function ManageContent({ params }: { params: PageProps<"/manage/[code]">["params"] }) {
  const { code } = await params;
  return <ManageView code={code} />;
}

export default function ManagePage({ params }: PageProps<"/manage/[code]">) {
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-bold tracking-tight">Manage dynamic QR code</h1>
      <p className="mt-2 text-muted">Change where the code points, pause it, or download it again.</p>
      <div className="mt-8">
        <Suspense fallback={<p className="text-muted">Loading QR code…</p>}>
          <ManageContent params={params} />
        </Suspense>
      </div>
    </div>
  );
}
