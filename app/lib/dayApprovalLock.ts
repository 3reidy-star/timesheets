import type { Prisma } from "@prisma/client";
import { prisma } from "@/app/lib/prisma";
import { ensureDayApprovalSchema } from "@/app/lib/dayApprovalSchema";

export class ApprovalConflict extends Error {}

// All entry writes, submissions and approvals lock the same week row.
export async function lockWeeks(tx: Prisma.TransactionClient, ids: string[]) {
  for (const id of [...new Set(ids)].sort()) {
    await tx.$queryRaw`SELECT id FROM "TimesheetWeek" WHERE id = ${id} FOR UPDATE`;
  }
}

export async function withEditableDays<T>(
  days: { weekId: string; date: Date }[],
  isAdmin: boolean,
  write: (tx: Prisma.TransactionClient) => Promise<T>,
  expectedEntry?: { id: string; weekId: string; date: Date },
) {
  await ensureDayApprovalSchema();
  return prisma.$transaction(async (tx) => {
    await lockWeeks(tx, days.map((day) => day.weekId));
    if (expectedEntry) {
      const current = await tx.timesheetEntry.findUnique({ where: { id: expectedEntry.id } });
      if (!current || current.weekId !== expectedEntry.weekId || current.date.getTime() !== expectedEntry.date.getTime()) {
        throw new ApprovalConflict("This entry has changed. Refresh before making further changes.");
      }
    }
    for (const day of days) {
      const week = await tx.timesheetWeek.findUnique({ where: { id: day.weekId } });
      const approval = await tx.dayApproval.findUnique({ where: { weekId_date: day } });
      if (!week || week.status === "APPROVED" || (!isAdmin && week.status === "SUBMITTED") ||
          approval?.status === "APPROVED" || approval?.status === "PENDING") {
        throw new ApprovalConflict("This day is submitted or approved. Ask an administrator to reopen it before making changes.");
      }
    }
    return write(tx);
  });
}
