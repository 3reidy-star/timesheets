export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { auth } from "@/auth";
import { prisma } from "@/app/lib/prisma";
import { calcWeekTotals } from "@/app/lib/timesheetTotals";
import { redirect } from "next/navigation";
import AdminApprovalsPageClient, {
  type ApprovalWeek,
} from "./AdminApprovalsPageClient";

function toIso(value: Date | string) {
  return value instanceof Date ? value.toISOString() : value;
}

function startOfWeekMonday(dateInput: Date) {
  const date = new Date(dateInput);
  const day = date.getDay();
  const difference = day === 0 ? -6 : 1 - day;

  date.setDate(date.getDate() + difference);
  date.setHours(0, 0, 0, 0);

  return date;
}

export default async function AdminApprovalsPage() {
  const session = await auth();

  if (!session?.user?.email) {
    redirect("/login?callbackUrl=/admin/approvals");
  }

  const currentUser = await prisma.user.findUnique({
    where: {
      email: session.user.email,
    },
    select: {
      role: true,
      active: true,
    },
  });

  if (
    !currentUser ||
    !currentUser.active ||
    currentUser.role !== "ADMIN"
  ) {
    redirect("/timesheet");
  }

  const currentWeekStart = startOfWeekMonday(new Date());

  const weeks = await prisma.timesheetWeek.findMany({
    where: {
      weekStart: {
        gte: new Date(
          currentWeekStart.getFullYear(),
          currentWeekStart.getMonth() - 3,
          1,
        ),
      },
    },
    orderBy: [
      {
        weekStart: "desc",
      },
      {
        user: {
          name: "asc",
        },
      },
    ],
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          active: true,
        },
      },
      entries: {
        orderBy: [
          {
            date: "asc",
          },
          {
            createdAt: "asc",
          },
        ],
      },
    },
    take: 500,
  });

  const formattedWeeks: ApprovalWeek[] = weeks
    .filter((week) => week.user?.active)
    .map((week) => {
      const computed = calcWeekTotals(week.entries);

      return {
        id: week.id,
        weekStart: toIso(week.weekStart),
        status: String(week.status),

        user: {
          id: week.user.id,
          name: week.user.name,
          email: week.user.email ?? "Unknown user",
        },

        entries: week.entries.map((entry) => ({
          id: entry.id,
          date: toIso(entry.date),
          type: String(entry.type),
          job: entry.job || "",
          description: entry.description || null,
          startTime: entry.startTime || "",
          finishTime: entry.finishTime || "",
          hours: Number(entry.hours || 0),
          regularHours: Number(entry.regularHours || 0),
          otMonFriHours: Number(entry.otMonFriHours || 0),
          otSatHours: Number(entry.otSatHours || 0),
          otSunBhHours: Number(entry.otSunBhHours || 0),
          overnight: Boolean(entry.overnight),
        })),

        computed: {
          days: computed.days.map((day) => ({
            date: day.date,
            workedHours: Number(day.workedHours || 0),
            breakHours: Number(day.breakHours || 0),
            paidHours: Number(day.paidHours || 0),
            regularHours: Number(day.regularHours || 0),
            otMonFriHours: Number(day.otMonFriHours || 0),
            otSatHours: Number(day.otSatHours || 0),
            otSunBhHours: Number(day.otSunBhHours || 0),
            overnightCount: Number(day.overnightCount || 0),
          })),

          totals: {
            workedHours: Number(computed.totals.workedHours || 0),
            breakHours: Number(computed.totals.breakHours || 0),
            paidHours: Number(computed.totals.paidHours || 0),
            regularHours: Number(computed.totals.regularHours || 0),
            otMonFriHours: Number(computed.totals.otMonFriHours || 0),
            otSatHours: Number(computed.totals.otSatHours || 0),
            otSunBhHours: Number(computed.totals.otSunBhHours || 0),
            overtimeTotal: Number(computed.totals.overtimeTotal || 0),
            overnightCount: Number(computed.totals.overnightCount || 0),
            businessTopUpHours: Number(
              computed.totals.businessTopUpHours || 0,
            ),
          },
        },
      };
    });

  return <AdminApprovalsPageClient initialWeeks={formattedWeeks} />;
}