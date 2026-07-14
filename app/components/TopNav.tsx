import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/prisma";
import LogoutButton from "./LogoutButton";

export default async function TopNav() {
  const session = await auth();

  if (!session?.user?.email) {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: {
      email: session.user.email,
    },
    select: {
      role: true,
      active: true,
      name: true,
    },
  });

  if (!user || !user.active) {
    return null;
  }

  const homeHref =
    user.role === "ADMIN"
      ? "/admin/approvals"
      : user.role === "ACCOUNTS"
        ? "/admin/payroll"
        : "/timesheet";

  return (
    <header className="w-full border-b border-white/10 bg-[#002944]">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-6 py-4">
        <Link href={homeHref} className="flex items-center gap-3">
          <img
            src="/logo.png"
            alt="Company logo"
            className="h-8 w-auto"
          />

          <div className="hidden sm:block">
            <div className="text-sm font-semibold text-white">
              Timesheets
            </div>

            <div className="text-xs text-white/60">
              {user.name || "Internal system"}
            </div>
          </div>
        </Link>

        <nav className="flex flex-wrap items-center gap-2">
          {user.role === "ENGINEER" && (
            <Link
              href="/timesheet"
              className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-[#003358] hover:bg-white/90"
            >
              My Timesheet
            </Link>
          )}

          {user.role === "ACCOUNTS" && (
            <Link
              href="/admin/payroll"
              className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-[#003358] hover:bg-white/90"
            >
              Payroll
            </Link>
          )}

          {user.role === "ADMIN" && (
            <>
              <Link
                href="/admin/timesheets"
                className="rounded-xl border border-white/20 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10"
              >
                Timesheets
              </Link>

              <Link
                href="/admin/approvals"
                className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-[#003358] hover:bg-white/90"
              >
                Approvals
              </Link>

              <Link
                href="/admin/payroll"
                className="rounded-xl border border-white/20 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10"
              >
                Payroll
              </Link>

              <Link
                href="/admin/users"
                className="rounded-xl border border-white/20 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10"
              >
                Users
              </Link>
            </>
          )}

          <LogoutButton />
        </nav>
      </div>
    </header>
  );
}