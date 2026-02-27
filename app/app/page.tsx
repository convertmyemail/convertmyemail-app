// app/app/page.tsx
import { Suspense } from "react";
import UploadPageClient from "./uploadpage.client";

export const dynamic = "force-dynamic";

type SP = { plan?: string | string[] };

export default async function AppPage({
  searchParams,
}: {
  searchParams?: Promise<SP> | SP;
}) {
  const sp = (await Promise.resolve(searchParams)) || {};

  // handle both string and string[] (Next can sometimes give arrays)
  const planRaw = sp.plan;
  const plan =
    typeof planRaw === "string" ? planRaw : Array.isArray(planRaw) ? planRaw[0] : null;

  return (
    <Suspense fallback={<div className="p-6 text-sm text-gray-500">Loading…</div>}>
      <UploadPageClient plan={plan} />
    </Suspense>
  );
}