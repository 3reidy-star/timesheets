export const runtime = "nodejs";

import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { ensureDayApprovalSchema } from "@/app/lib/dayApprovalSchema";
import { lockWeeks, ApprovalConflict } from "@/app/lib/dayApprovalLock";
import { parsePayrollDate } from "@/app/lib/payrollApproval";
import { calcWeekTotals } from "@/app/lib/timesheetTotals";

export const dynamic = "force-dynamic";

function getString(v: unknown) {
  return typeof v === "string" ? v.trim() : "";
}

export async function POST(req: Request) {
  try {
    const session = await auth();

    if (!session?.user?.email) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, name: true, email: true, role: true, active: true },
    });

    if (!user || !user.active) {
      return NextResponse.json({ error: "User not found" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const weekId = getString(body?.weekId);
    const through = body?.through ? parsePayrollDate(body.through) : null;
    const singleDay = body?.date ? parsePayrollDate(body.date) : null;
    if ((body?.date && !singleDay) || (body?.date && body?.through)) {
      return NextResponse.json({ error: "Provide one valid day or a payroll cutoff, not both" }, { status: 400 });
    }
    if (body?.through && (!through || through.getUTCDate() !== 15)) {
      return NextResponse.json({ error: "Payroll cutoff must be a valid 15th of the month" }, { status: 400 });
    }

    if (!weekId) {
      return NextResponse.json({ error: "weekId is required" }, { status: 400 });
    }

    const isAdmin = user.role === "ADMIN" || user.role === "ACCOUNTS";
    const existing = await prisma.timesheetWeek.findFirst({
      where: isAdmin ? { id: weekId } : { id: weekId, userId: user.id },
      select: { id: true, status: true, userId: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "Week not found" }, { status: 404 });
    }

    await ensureDayApprovalSchema();
    const week = await prisma.$transaction(async (tx) => {
      await lockWeeks(tx, [weekId]);
      const current = await tx.timesheetWeek.findUniqueOrThrow({
        where: { id: weekId }, include: { entries: true, dayApprovals: true },
      });
      if (current.status !== "DRAFT" && current.status !== "REJECTED") throw new ApprovalConflict("Only an open week can be submitted");
      const weekEnd = new Date(current.weekStart);
      weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);
      if (through && (through < current.weekStart || through >= weekEnd)) throw new ApprovalConflict("The cutoff must fall within the selected week");
      if (singleDay && (singleDay < current.weekStart || singleDay >= weekEnd)) throw new ApprovalConflict("The day must fall within the selected week");
      const eligibleDays = calcWeekTotals(current.entries, current.weekStart).days
        .map((day) => parsePayrollDate(day.date)!).filter((date) =>
          (!through || date <= through) && (!singleDay || date.getTime() === singleDay.getTime()));
      if (!eligibleDays.length) throw new ApprovalConflict("There are no days to submit");
      for (const date of eligibleDays) {
        if (current.dayApprovals.some((day) => day.date.getTime() === date.getTime() && day.status === "APPROVED")) continue;
        await tx.dayApproval.upsert({
          where: { weekId_date: { weekId, date } }, create: { weekId, date, status: "PENDING" },
          update: { status: "PENDING", comment: null, reviewedById: null, reviewedAt: null },
        });
      }
      {
        await tx.timesheetWeek.update({
          where: { id: weekId },
          data: { status: through || singleDay ? "DRAFT" : "SUBMITTED" },
        });

        await tx.weekAudit.create({
          data: {
            weekId,
            action: "SUBMITTED" as any,
            comment: singleDay ? `Day ${body.date} resubmitted for approval after correction.` : through ? `Days submitted through ${body.through} for payroll; remaining days stay open.` :
              isAdmin && existing.userId !== user.id
                ? "Resubmitted by an administrator on behalf of the employee."
                : null,
            performedById: user.id,
          },
        });
      }

      return tx.timesheetWeek.findUnique({
        where: { id: weekId },
        include: {
          dayApprovals: true,
          entries: {
            orderBy: [{ date: "asc" }, { createdAt: "asc" }],
          },
          audits: {
            orderBy: { createdAt: "asc" },
            include: {
              performedBy: { select: { id: true, name: true, email: true } },
            },
          },
        },
      });
    });

    return NextResponse.json({ ok: true, week });
  } catch (e: any) {
    console.error("submit week error:", e);
    return NextResponse.json(
      { error: e?.message ?? "Failed to submit week" },
      { status: e instanceof ApprovalConflict ? 409 : 500 }
    );
  }
}
