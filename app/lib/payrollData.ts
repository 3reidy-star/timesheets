import { prisma } from "@/app/lib/prisma";
import { ensureDayApprovalSchema } from "@/app/lib/dayApprovalSchema";
import { isPayrollDayApproved } from "@/app/lib/payrollApproval";

export async function approvedPayrollEntries(from: Date, to: Date, userId?: string) {
  await ensureDayApprovalSchema();
  const weeks = await prisma.timesheetWeek.findMany({
    where: {
      ...(userId ? { userId } : { user: { active: true } }),
      entries: { some: { date: { gte: from, lte: to } } },
      OR: [{ status: "APPROVED" }, { dayApprovals: { some: { status: "APPROVED" } } }],
    },
    include: { user: true, dayApprovals: true, entries: true },
  });
  return weeks.flatMap((week) => week.entries
    .filter((entry) => entry.date >= from && entry.date <= to && isPayrollDayApproved(week, entry.date))
    .map((entry) => ({ ...entry, week })));
}
