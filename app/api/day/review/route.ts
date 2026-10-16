export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { auth } from "@/auth";
import { prisma } from "@/app/lib/prisma";
import { ensureDayApprovalSchema } from "@/app/lib/dayApprovalSchema";
import { lockWeeks, ApprovalConflict } from "@/app/lib/dayApprovalLock";
import { parsePayrollDate } from "@/app/lib/payrollApproval";
import { calcWeekTotals } from "@/app/lib/timesheetTotals";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.email) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    const reviewer = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!reviewer?.active || !["ADMIN", "ACCOUNTS"].includes(reviewer.role)) {
      return NextResponse.json({ error: "Not authorised" }, { status: 403 });
    }
    const body = await req.json();
    const weekId = typeof body.weekId === "string" ? body.weekId : "";
    const date = parsePayrollDate(body.date);
    const action = body.action;
    const comment = typeof body.comment === "string" ? body.comment.trim() : "";
    if (!weekId || !date || !["APPROVE", "REJECT", "REOPEN"].includes(action)) {
      return NextResponse.json({ error: "Valid weekId, date and action are required" }, { status: 400 });
    }
    if (action !== "APPROVE" && !comment) return NextResponse.json({ error: "A reason is required" }, { status: 400 });
    await ensureDayApprovalSchema();
    const week = await prisma.$transaction(async (tx) => {
      await lockWeeks(tx, [weekId]);
      const current = await tx.timesheetWeek.findUnique({
        where: { id: weekId }, include: { entries: true, dayApprovals: true },
      });
      if (!current) throw new ApprovalConflict("Week not found");
      const days = calcWeekTotals(current.entries, current.weekStart).days;
      if (!days.some((day) => day.date === body.date)) throw new ApprovalConflict("Day not found in this week");
      const previous = current.dayApprovals.find((day) => day.date.getTime() === date.getTime());
      if (action === "APPROVE" && (current.status === "APPROVED" || previous?.status === "APPROVED")) return current;
      if (action === "REJECT" && previous?.status === "APPROVED") throw new ApprovalConflict("Reopen the approved day before returning it for correction");
      if (action !== "REOPEN" && current.status !== "SUBMITTED" && previous?.status !== "PENDING") {
        throw new ApprovalConflict("This day must be submitted before review");
      }
      if (action === "REOPEN" && current.status !== "APPROVED" && previous?.status !== "APPROVED" && previous?.status !== "PENDING") {
        throw new ApprovalConflict("Only submitted or approved days can be reopened");
      }
      // Preserve other dates in historical whole-week approvals.
      if (current.status === "APPROVED") {
        for (const day of days) {
          const dayDate = parsePayrollDate(day.date)!;
          await tx.dayApproval.upsert({
            where: { weekId_date: { weekId, date: dayDate } },
            create: { weekId, date: dayDate, status: "APPROVED" }, update: {},
          });
        }
      }
      const status = action === "APPROVE" ? "APPROVED" : "REJECTED";
      await tx.dayApproval.upsert({
        where: { weekId_date: { weekId, date } },
        create: { weekId, date, status, comment: comment || null, reviewedById: reviewer.id, reviewedAt: new Date() },
        update: { status, comment: comment || null, reviewedById: reviewer.id, reviewedAt: new Date() },
      });
      if (action !== "APPROVE") await tx.timesheetWeek.update({ where: { id: weekId }, data: { status: "DRAFT" } });
      await tx.weekAudit.create({ data: {
        weekId, performedById: reviewer.id,
        action: action === "APPROVE" ? "APPROVED" : action === "REJECT" ? "REJECTED" : "EDITED",
        comment: `${body.date}: ${action}${comment ? ` — ${comment}` : ""}`,
      } });
      return tx.timesheetWeek.findUniqueOrThrow({ where: { id: weekId }, include: { dayApprovals: true } });
    });
    return NextResponse.json({ ok: true, week });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not review day" },
      { status: error instanceof ApprovalConflict ? 409 : 500 });
  }
}
