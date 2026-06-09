export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { auth } from "@/auth";
import { prisma } from "@/app/lib/prisma";
import { redirect } from "next/navigation";
import AdminTimesheetsPageClient, {
  type AdminTimesheetWeek,
} from "./AdminTimesheetsPageClient";

function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value) || 0;
  if (value && typeof value === "object" && "toNumber" in value) {
    return (value as { toNumber: () => number }).toNumber();
  }
  return 0;
}

function toIso(value: Date | string): string {
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
        orderBy: [{ date: "asc" }],
        select: {
          id: true,
          date: true,
          type: true,
          job: true,
          startTime: true,
          finishTime: true,
          hours: true,
          regularHours: true,
          otMonFriHours: true,
          otSatHours: true,
          otSunBhHours: true,
          overnight: true,
          agreedRate: true,
          description: true,
        },
      },
    },
  });

  const serialisedWeeks: AdminTimesheetWeek[] = weeks.map((week) => {
    const entries = week.entries.map((entry) => ({
      id: entry.id,
      date: toIso(entry.date),
      type: entry.type,
      job: entry.job,
      startTime: entry.startTime,
      finishTime: entry.finishTime,
      hours: toNumber(entry.hours),
      regularHours: toNumber(entry.regularHours),
      otMonFriHours: toNumber(entry.otMonFriHours),
      otSatHours: toNumber(entry.otSatHours),
      otSunBhHours: toNumber(entry.otSunBhHours),
      overnight: Boolean(entry.overnight),
      agreedRate: entry.agreedRate === null ? null : toNumber(entry.agreedRate),
      description: entry.description,
    }));

    const totals = entries.reduce(
      (acc, entry) => {
        acc.hours += entry.hours;
        acc.regular += entry.regularHours;
        acc.otMonFri += entry.otMonFriHours;
        acc.otSat += entry.otSatHours;
        acc.otSunBh += entry.otSunBhHours;
        return acc;
      },
      {
        hours: 0,
        regular: 0,
        otMonFri: 0,
        otSat: 0,
        otSunBh: 0,
      }
    );

    return {
      id: week.id,
      weekStart: toIso(week.weekStart),
      status: week.status,
      user: week.user,
      entries,
      totals,
    };
  });

  return <AdminTimesheetsPageClient weeks={serialisedWeeks} />;
}