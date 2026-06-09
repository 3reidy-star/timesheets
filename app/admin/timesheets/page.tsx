import { auth } from "@/auth";
import { prisma } from "@/app/lib/prisma";
import { redirect } from "next/navigation";
import AdminTimesheetsPageClient from "./AdminTimesheetsPageClient";

export const dynamic = "force-dynamic";

export default async function AdminTimesheetsPage() {
  const session = await auth();

  if (!session?.user?.email) {
    redirect("/login?callbackUrl=/admin/timesheets");
  }

  const currentUser = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { role: true, active: true },
  });

  if (
    !currentUser ||
    !currentUser.active ||
    (currentUser.role !== "ADMIN" && currentUser.role !== "ACCOUNTS")
  ) {
    redirect("/timesheet");
  }

  return <AdminTimesheetsPageClient />;
}