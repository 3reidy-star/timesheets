export const runtime = "nodejs";

import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { lockWeeks, ApprovalConflict } from "@/app/lib/dayApprovalLock";
import { calcWeekTotals } from "@/app/lib/timesheetTotals";
import { parsePayrollDate } from "@/app/lib/payrollApproval";

function getString(v: unknown) {
  return typeof v === "string" ? v.trim() : "";
}

export async function POST(req: Request) {
  try {
    const session = await auth();

    if (!session?.user?.email) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const reviewer = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: {
        id: true,
        email: true,
        role: true,
        active: true,
      },
    });

    if (!reviewer || !reviewer.active) {
      return NextResponse.json({ error: "User not found" }, { status: 403 });
    }

    if (reviewer.role !== "ADMIN" && reviewer.role !== "ACCOUNTS") {
      return NextResponse.json({ error: "Not authorised to review weeks" }, { status: 403 });
    }

    const body = await req.json();

    const weekId = getString(body?.weekId);
    const action = getString(body?.action).toUpperCase(); // APPROVE | REJECT | REOPEN
    const commentRaw = getString(body?.comment);
    const comment = commentRaw ? commentRaw : null;

    if (!weekId) {
      return NextResponse.json({ error: "weekId is required" }, { status: 400 });
    }

    if (action !== "APPROVE" && action !== "REJECT" && action !== "REOPEN") {
      return NextResponse.json(
        { error: "action must be APPROVE, REJECT or REOPEN" },
        { status: 400 }
      );
    }

    if ((action === "REJECT" || action === "REOPEN") && !comment) {
      return NextResponse.json(
        { error: `Comment is required when ${action === "REOPEN" ? "reopening" : "rejecting"} a week.` },
        { status: 400 }
      );
    }

    const week = await prisma.timesheetWeek.findUnique({
      where: { id: weekId },
      select: { id: true, status: true },
    });

    if (!week) {
      return NextResponse.json({ error: "Week not found" }, { status: 404 });
    }

    if (action === "REOPEN" && week.status !== "APPROVED") {
      return NextResponse.json(
        { error: `Week is ${week.status} and cannot be reopened.` },
        { status: 400 }
      );
    }

    if (action !== "REOPEN" && week.status !== "SUBMITTED") {
      return NextResponse.json(
        { error: `Week is ${week.status} and cannot be reviewed.` },
        { status: 400 }
      );
    }

    // Policy:
    // - approve locks
    // - reject returns a submitted week to draft for editing
    // - reopen returns an approved week to draft for correction and resubmission
    const newStatus = action === "APPROVE" ? "APPROVED" : "DRAFT";
    const auditAction =
      action === "APPROVE"
        ? "APPROVED"
        : action === "REJECT"
          ? "REJECTED"
          : "EDITED";
    const auditComment =
      action === "REOPEN" ? `Approved week reopened: ${comment}` : comment;

    const result = await prisma.$transaction(async (tx) => {
      await lockWeeks(tx, [weekId]);
      const current = await tx.timesheetWeek.findUniqueOrThrow({ where: { id: weekId }, include: { entries: true, dayApprovals: true } });
      if (current.status !== (action === "REOPEN" ? "APPROVED" : "SUBMITTED")) throw new ApprovalConflict("The week status has changed. Refresh and try again.");
      if (action === "APPROVE") {
        const days = calcWeekTotals(current.entries, current.weekStart).days;
        if (!days.length) throw new ApprovalConflict("There are no days to approve.");
        for (const day of days) {
          const date = parsePayrollDate(day.date)!;
          await tx.dayApproval.upsert({
            where: { weekId_date: { weekId, date } },
            create: { weekId, date, status: "APPROVED", reviewedById: reviewer.id, reviewedAt: new Date() },
            update: { status: "APPROVED", reviewedById: reviewer.id, reviewedAt: new Date() },
          });
        }
      } else if (action === "REOPEN") {
        await tx.dayApproval.deleteMany({ where: { weekId } });
      } else {
        await tx.dayApproval.deleteMany({ where: { weekId, status: { not: "APPROVED" } } });
      }
      const updated = await tx.timesheetWeek.update({
        where: { id: weekId },
        data: { status: newStatus },
        include: { dayApprovals: true },
      });

      await tx.weekAudit.create({
        data: {
          weekId,
          action: auditAction as any,
          comment: auditComment,
          performedById: reviewer.id,
        },
      });

      return updated;
    });

    return NextResponse.json({ ok: true, status: result.status, week: result });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Failed to review week" },
      { status: err instanceof ApprovalConflict ? 409 : 500 }
    );
  }
}
