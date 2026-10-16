export const runtime = "nodejs";

import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { ensureDayApprovalSchema } from "@/app/lib/dayApprovalSchema";
import { withEditableDays, ApprovalConflict } from "@/app/lib/dayApprovalLock";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.email) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    const user = await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true, role: true, active: true } });
    if (!user?.active) return NextResponse.json({ error: "Not authorised" }, { status: 403 });
    const p = (ctx as any).params;
    const { id } =
      typeof (p as any)?.then === "function"
        ? await (p as Promise<{ id: string }>)
        : (p as { id: string });

    if (!id || typeof id !== "string") {
      return NextResponse.json({ error: "Missing entry id" }, { status: 400 });
    }

    await ensureDayApprovalSchema();
    const entry = await prisma.timesheetEntry.findUnique({
      where: { id },
      select: {
        id: true,
        weekId: true,
        userId: true,
        week: {
          select: {
            id: true,
            status: true,
            weekStart: true,
            dayApprovals: { select: { date: true, status: true } },
          },
        },
        date: true,
        type: true,
        job: true,
        description: true,
        hours: true,
        startTime: true,
        finishTime: true,
        regularHours: true,
        otMonFriHours: true,
        otSatHours: true,
        otSunBhHours: true,
        overnight: true,
        leftEarlyByChoice: true,
        jobAndKnock: true,
        agreedRate: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!entry) {
      return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    }
    if (entry.userId !== user.id && user.role !== "ADMIN" && user.role !== "ACCOUNTS") return NextResponse.json({ error: "Not authorised" }, { status: 403 });

    return NextResponse.json({ entry });
  } catch (e: any) {
    console.error("api/entry/[id] GET error:", e);
    return NextResponse.json(
      { error: e?.message ?? "Failed to load entry" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const session = await auth();

    if (!session?.user?.email) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const p = (ctx as any).params;
    const { id } =
      typeof (p as any)?.then === "function"
        ? await (p as Promise<{ id: string }>)
        : (p as { id: string });

    if (!id || typeof id !== "string") {
      return NextResponse.json({ error: "Missing entry id" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, active: true },
    });

    if (!user || !user.active) {
      return NextResponse.json({ error: "User not found or inactive" }, { status: 403 });
    }

    const entry = await prisma.timesheetEntry.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        weekId: true,
        date: true,
        week: {
          select: {
            status: true,
          },
        },
      },
    });

    if (!entry) {
      return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    }

    if (entry.userId !== user.id) {
      return NextResponse.json(
        { error: "You can only delete your own timesheet entries" },
        { status: 403 }
      );
    }

    if (entry.week.status !== "DRAFT" && entry.week.status !== "REJECTED") {
      return NextResponse.json(
        { error: "Submitted or approved timesheet entries cannot be deleted" },
        { status: 409 }
      );
    }

    await withEditableDays([{ weekId: entry.weekId, date: entry.date }], false, (tx) => tx.timesheetEntry.delete({ where: { id } }), entry);

    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error("api/entry/[id] DELETE error:", e);
    return NextResponse.json(
      { error: e?.message ?? "Failed to delete entry" },
      { status: e instanceof ApprovalConflict ? 409 : 500 }
    );
  }
}
