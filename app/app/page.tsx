// app/app/page.tsx
import UploadPageClient from "./uploadpage.client";

export const dynamic = "force-dynamic";

type UsageInfo =
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

export default function AppPage() {
  const usage: UsageInfo = {
    plan: "Free",
    isPaid: false,
    used: 0,
    remaining: 3,
    limit: 3,
    status: "free",
  };

  return <UploadPageClient usage={usage} />;
}