import Link from "next/link";
import LogoutButton from "./LogoutButton";

export default function TopNav() {
  return (
    <header className="w-full border-b border-white/10 bg-[#002944]">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-center gap-3">
          <img src="/logo.png" alt="Company logo" className="h-8 w-auto" />

          <div className="hidden sm:block">
            <div className="text-sm font-semibold text-white">Timesheets</div>
            <div className="text-xs text-white/60">Internal system</div>
          </div>
        </Link>

        <nav className="flex flex-wrap items-center gap-2">
          <Link
            href="/"
            className="rounded-xl border border-white/15 bg-transparent px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10"
          >
            Overview
          </Link>

          <Link
            href="/timesheet"
            className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-[#003358] transition hover:bg-white/90"
          >
            Weekly timesheet
          </Link>

          <Link
            href="/approvals"
            className="rounded-xl border border-white/15 bg-transparent px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10"
          >
            Approvals
          </Link>

          <Link
            href="/admin/timesheets"
            className="rounded-xl border border-white/15 bg-transparent px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10"
          >
            Admin
          </Link>

          <LogoutButton />
        </nav>
      </div>
    </header>
  );
}