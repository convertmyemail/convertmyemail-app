"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";

type Props = {
  variant?: "marketing" | "app";
};

function NavLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const active = pathname === href;

  return (
    <Link
      href={href}
      className={[
        "text-sm font-medium transition-colors",
        active ? "text-gray-900" : "text-gray-600 hover:text-gray-900",
      ].join(" ")}
      aria-current={active ? "page" : undefined}
    >
      {children}
    </Link>
  );
}

function BrandMark({ size = 32 }: { size?: number }) {
  return (
    <span
      className="inline-flex items-center justify-center overflow-hidden rounded-xl"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <Image
        src="/icon-light.png"
        alt=""
        width={size}
        height={size}
        priority
        className="block h-full w-full object-contain dark:hidden"
      />
      <Image
        src="/icon-dark.png"
        alt=""
        width={size}
        height={size}
        priority
        className="hidden h-full w-full object-contain dark:block"
      />
    </span>
  );
}

export default function SiteHeader({ variant = "marketing" }: Props) {
  const pathname = usePathname();
  const isDashboard = pathname?.startsWith("/app");

  const ctaHref = isDashboard || variant === "app" ? "/" : "/login";
  const ctaLabel = isDashboard || variant === "app" ? "Home" : "Login";

  return (
    <header className="sticky top-0 z-20 border-b border-gray-200 bg-white/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-center gap-2">
          <BrandMark size={32} />
          <div className="leading-tight">
            <div className="text-sm font-semibold tracking-tight text-gray-900">
              Convert My Email
            </div>
            <div className="mt-0.5 text-xs text-gray-500">Professional conversions</div>
          </div>
        </Link>

        <nav className="hidden items-center gap-6 md:flex" aria-label="Primary">
          <NavLink href="/how-it-works">How it works</NavLink>
          <NavLink href="/how-to-save-eml">How to save an .eml</NavLink>
          <NavLink href="/pricing">Pricing</NavLink>
        </nav>

        <div className="flex items-center gap-3">
          <Link
            href={ctaHref}
            className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-black"
          >
            {ctaLabel}
          </Link>
        </div>
      </div>

      <div className="border-t border-gray-200 bg-white md:hidden">
        <div className="mx-auto flex max-w-6xl items-center gap-5 px-6 py-3">
          <NavLink href="/how-it-works">How it works</NavLink>
          <NavLink href="/how-to-save-eml">Save .eml</NavLink>
          <NavLink href="/pricing">Pricing</NavLink>

          <span className="ml-auto">
            <Link
              href={ctaHref}
              className="rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-black"
            >
              {ctaLabel}
            </Link>
          </span>
        </div>
      </div>
    </header>
  );
}