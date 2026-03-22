"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";

export default function TopNav() {
  return (
    <header className="w-full border-b border-white/10 bg-[#002944]">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-center gap-3">
          <img
            src="/logo.png"
            alt="Company logo"
            className="h-8 w-auto"
          />

          <div className="hidden sm:block">
            <div className="text-sm font-semibold text-white">Timesheets</div>
            <div className="text-xs text-white/60">Internal system</div>
          </div>
        </Link>

        <nav className="flex items-center gap-2">
          <Link
            href="/"
            className="rounded-xl border border-white/15 bg-transparent px-4 py-2 text-sm font-semibold text-white hover:bg-white/10 transition"
          >
            Overview
          </Link>

          <Link
            href="/timesheet"
            className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-[#003358] hover:bg-white/90 transition"
          >
            Weekly timesheet
          </Link>

          {/* NEW LOGOUT BUTTON */}
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-200 hover:bg-red-500/20 transition"
          >
            Logout
          </button>
        </nav>
      </div>
    </header>
  );
}