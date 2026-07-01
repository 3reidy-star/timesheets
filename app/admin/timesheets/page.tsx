export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { auth } from "@/auth";
import { prisma } from "@/app/lib/prisma";
import { redirect } from "next/navigation";
import TopNav from "@/app/components/TopNav";
import AdminTimesheetsPageClient, {
  type AdminTimesheetWeekSummary,
} from "./AdminTimesheetsPageClient";

function toIso(value: Date | string) {
  return value instanceof Date ? value.toISOString() : value;
}

function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value) || 0;
  if (value && typeof value === "object" && "toNumber" in value) {
    return (value as { toNumber: () => number }).toNumber();
  }
  return 0;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
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
    (currentUser.role !== "ADMIN" && currentUser.role !== "ACCOUNTS")
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
        select: {
          hours: true,
          regularHours: true,
          otMonFriHours: true,
          otSatHours: true,
          otSunBhHours: true,
          overnight: true,
        },
      },
    },
    take: 250,
  });

  const formattedWeeks: AdminTimesheetWeekSummary[] = weeks.map((week) => {
    const totalHours = round2(
      week.entries.reduce((sum, entry) => sum + toNumber(entry.hours), 0)
    );

    const regularHours = round2(
      week.entries.reduce((sum, entry) => sum + toNumber(entry.regularHours), 0)
    );

    const overtimeHours = round2(
      week.entries.reduce(
        (sum, entry) =>
          sum +
          toNumber(entry.otMonFriHours) +
          toNumber(entry.otSatHours) +
          toNumber(entry.otSunBhHours),
        0
      )
    );

    const overnightCount = week.entries.filter((entry) =>
      Boolean(entry.overnight)
    ).length;

    return {
      id: week.id,
      weekStart: toIso(week.weekStart),
      status: String(week.status),
      totalHours,
      regularHours,
      overtimeHours,
      overnightCount,
      user: {
        id: week.user.id,
        name: week.user.name,
        email: week.user.email,
      },
    };
  });

  return (
    <>
      <TopNav />
      <AdminTimesheetsPageClient initialWeeks={formattedWeeks} />
    </>
  );
}