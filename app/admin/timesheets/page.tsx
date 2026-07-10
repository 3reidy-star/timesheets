export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { auth } from "@/auth";
import { prisma } from "@/app/lib/prisma";
import { calcWeekTotals } from "@/app/lib/timesheetTotals";
import { redirect } from "next/navigation";
import AdminTimesheetsPageClient, {
  type AdminTimesheetWeekSummary,
} from "./AdminTimesheetsPageClient";

function toIso(value: Date | string) {
  return value instanceof Date ? value.toISOString() : value;
}

export default async function AdminTimesheetsPage() {
  const session = await auth();

  if (!session?.user?.email) {
    redirect("/login?callbackUrl=/admin/timesheets");
  }

  const currentUser = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: {
      role: true,
      active: true,
    },
  });

  if (
    !currentUser ||
    !currentUser.active ||
    (currentUser.role !== "ADMIN" &&
      currentUser.role !== "ACCOUNTS")
  ) {
    redirect("/timesheet");
  }

  const weeks = await prisma.timesheetWeek.findMany({
    orderBy: [{ weekStart: "desc" }],
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      entries: {
        orderBy: [{ date: "asc" }, { createdAt: "asc" }],
      },
    },
    take: 250,
  });

  const formattedWeeks: AdminTimesheetWeekSummary[] = weeks.map((week) => {
    const computed = calcWeekTotals(week.entries);

    return {
      id: week.id,
      weekStart: toIso(week.weekStart),
      status: String(week.status),

      totalHours: computed.totals.paidHours,
      regularHours: computed.totals.regularHours,
      overtimeHours: computed.totals.overtimeTotal,
      overnightCount: computed.totals.overnightCount,

      user: {
        id: week.user?.id ?? "",
        name: week.user?.name ?? null,
        email: week.user?.email ?? "Unknown user",
      },
    };
  });

  return (
    <AdminTimesheetsPageClient
      initialWeeks={formattedWeeks}
    />
  );
}