export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { auth } from "@/auth";
import { prisma } from "@/app/lib/prisma";
import { NextResponse } from "next/server";
import { lockWeeks, ApprovalConflict } from "@/app/lib/dayApprovalLock";

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ weekId: string }> | { weekId: string } }
) {
  try {
    const session = await auth();

    if (!session?.user?.email) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const currentUser = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { role: true, active: true },
    });

    if (!currentUser || !currentUser.active || currentUser.role !== "ADMIN") {
      return NextResponse.json({ error: "Not authorised" }, { status: 403 });
    }

    const p = ctx.params as any;
    const { weekId } =
      typeof p?.then === "function" ? await p : (p as { weekId: string });

    if (!weekId) {
      return NextResponse.json({ error: "Missing week id" }, { status: 400 });
    }

    await prisma.$transaction(async (tx) => {
      await lockWeeks(tx, [weekId]);
      const week = await tx.timesheetWeek.findUnique({ where: { id: weekId }, include: { dayApprovals: true } });
      if (week?.status === "APPROVED" || week?.dayApprovals.some((day) => day.status === "APPROVED" || day.status === "PENDING")) throw new ApprovalConflict("Reopen submitted or approved days before deleting this week.");
      await tx.weekAudit.deleteMany({ where: { weekId } });
      await tx.timesheetEntry.deleteMany({ where: { weekId } });
      await tx.timesheetWeek.delete({ where: { id: weekId } });
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Delete admin timesheet week error:", error);
    return NextResponse.json(
      { error: error instanceof ApprovalConflict ? error.message : "Failed to delete timesheet week" },
      { status: error instanceof ApprovalConflict ? 409 : 500 }
    );
  }
}
