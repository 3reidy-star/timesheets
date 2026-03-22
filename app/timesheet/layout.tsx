import TopNav from "../components/TopNav";
import LogoutButton from "../components/LogoutButton";
import { auth } from "@/auth";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function TimesheetLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!(session?.user as any)?.id) {
    redirect("/login?callbackUrl=/timesheet");
  }

  return (
    <>
      <TopNav />

      <div className="mx-auto flex max-w-6xl justify-end px-6 pt-4">
        <LogoutButton />
      </div>

      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>

      <footer className="mx-auto max-w-6xl px-6 pb-10 text-xs text-slate-500">
        <div className="border-t border-slate-200 pt-6">Timesheets</div>
      </footer>
    </>
  );
}