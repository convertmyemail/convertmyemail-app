"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

export default function MobileMenu({ loginHref }: { loginHref: string }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [open]);

  // Close on ESC key
  useEffect(() => {
    function handleEsc(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    if (open) {
      document.addEventListener("keydown", handleEsc);
    }

    return () => {
      document.removeEventListener("keydown", handleEsc);
    };
  }, [open]);

  return (
    <div className="relative md:hidden" ref={menuRef}>
      <button
        type="button"
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50"
      >
        {open ? "✕" : "☰"}
      </button>

      {open && (
        <div className="absolute right-0 top-12 w-64 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg">
          <div className="flex flex-col gap-1 p-2 text-sm">
            <Link
              href="#how"
              onClick={() => setOpen(false)}
              className="rounded-lg px-3 py-2 text-gray-700 hover:bg-gray-50 hover:text-gray-900"
            >
              How it works
            </Link>
            <Link
              href="#how-to-eml"
              onClick={() => setOpen(false)}
              className="rounded-lg px-3 py-2 text-gray-700 hover:bg-gray-50 hover:text-gray-900"
            >
              Save .eml
            </Link>
            <Link
              href="#pricing"
              onClick={() => setOpen(false)}
              className="rounded-lg px-3 py-2 text-gray-700 hover:bg-gray-50 hover:text-gray-900"
            >
              Pricing
            </Link>
            <Link
              href="#who"
              onClick={() => setOpen(false)}
              className="rounded-lg px-3 py-2 text-gray-700 hover:bg-gray-50 hover:text-gray-900"
            >
              Who it’s for
            </Link>

            <div className="my-1 border-t border-gray-200" />

            <Link
              href={loginHref}
              onClick={() => setOpen(false)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-center font-semibold text-gray-900 hover:bg-gray-50"
            >
              Sign in
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}