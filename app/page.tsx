import { redirect } from "next/navigation";

export default function Home({
  searchParams,
}: {
  searchParams?: { next?: string };
}) {
  const next = searchParams?.next;

  // If someone hits /?next=/app (or similar), preserve it.
  if (next) {
    redirect(`/login?next=${encodeURIComponent(next)}`);
  }

  // Default landing page
  redirect("/login");
}