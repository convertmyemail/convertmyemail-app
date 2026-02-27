// app/app/page.tsx
import { Suspense } from "react";
import UploadPageClient from "./uploadpage.client";

export const dynamic = "force-dynamic";

type SP = { plan?: string };

export default async function AppPage({
  searchParams,
}: {
  searchParams?: Promise<SP> | SP;
}) {
  const sp = (await Promise.resolve(searchParams)) || {};
  const plan = typeof sp.plan === "string" ? sp.plan : null;

  return (
    <Suspense fallback={<div className="p-6 text-sm text-gray-500">Loading…</div>}>
      <UploadPageClient plan={plan} />
    </Suspense>
  );
}