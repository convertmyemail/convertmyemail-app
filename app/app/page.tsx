// app/app/page.tsx
import UploadPageClient from "./uploadpage.client";

export const dynamic = "force-dynamic";

export type UsageInfo =
  | {
      plan: "Pro";
      isPaid: true;
      used: number | null;
      remaining: null;
      limit: null;
      status: string;
    }
  | {
      plan: "Free";
      isPaid: false;
      used: number;
      remaining: number;
      limit: number;
      status: "free";
    };

// Safe fallback; client shell will refresh with real values
const FALLBACK_USAGE: UsageInfo = {
  plan: "Free",
  isPaid: false,
  used: 0,
  remaining: 3,
  limit: 3,
  status: "free",
};

export default function AppPage() {
  return <UploadPageClient usage={FALLBACK_USAGE} />;
}