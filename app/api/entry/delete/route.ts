export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { calcWeekTotals } from "@/app/lib/timesheetTotals";

function toString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function toIso(value: Date | string) {
  return value instanceof Date ? value.toISOString() : value;
}

function entrySummary(entry: {
  date: Date;
  type: string;
  job: string | null;
  startTime: string | null;
  finishTime: string | null;
  hours: unknown;
}) {
  const date = toIso(entry.date).slice(0, 10);
  const type = entry.type || "WORK";
  const start = entry.startTime || "-";
  const finish = entry.finishTime || "-";
  const job = entry.job?.trim() || "(No job)";
  const hours = Number(entry.hours) || 0;

  return `${date} ${type} ${start}-${finish} ${job} (${hours.toFixed(2)}h)`;
}

export async function POST(request: Request) {
  try {
    const session = await auth();

    if (!session?.user?.email) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const currentUser = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        active: true,
      },
    });

    if (!currentUser || !currentUser.active) {
      return NextResponse.json({ error: "User not found" }, { status: 403 });
    }

    const body = await request.json();
    const id = toString(body?.id);

    if (!id) {
      return NextResponse.json({ error: "Missing entry id" }, { status: 400 });
    }

    const entry = await prisma.timesheetEntry.findUnique({
      where: { id },
      include: {
        week: {
          select: {
            id: true,
            userId: true,
            weekStart: true,
            status: true,
          },
        },
      },
    });

    if (!entry || !entry.week) {
      return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    }

    const isAdmin =
      currentUser.role === "ADMIN" || currentUser.role === "ACCOUNTS";

    const isOwner = entry.week.userId === currentUser.id;

    if (!isAdmin) {
      if (!isOwner) {
        return NextResponse.json({ error: "Not authorised" }, { status: 403 });
      }

      if (entry.week.status !== "DRAFT") {
        return NextResponse.json(
          { error: "Week is locked and cannot be edited" },
          { status: 400 },
        );
      }
    }

    const weekId = entry.week.id;
    const deletedSummary = entrySummary(entry);

    await prisma.$transaction(async (tx) => {
      await tx.timesheetEntry.delete({
        where: { id },
      });

      await tx.weekAudit.create({
        data: {
          weekId,
          action: "UPDATED" as any,
          comment: `Deleted entry: ${deletedSummary}`,
          performedById: currentUser.id,
        },
      });
    });

    const updatedWeek = await prisma.timesheetWeek.findUnique({
      where: { id: weekId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        entries: {
          orderBy: [{ date: "asc" }, { createdAt: "asc" }],
        },
      },
    });

    const computed = updatedWeek ? calcWeekTotals(updatedWeek.entries) : null;

    return NextResponse.json({
      ok: true,
      deletedEntryId: id,
      weekId,
      computed,
      weekSummary:
        updatedWeek && computed
          ? {
              id: updatedWeek.id,
              weekStart: toIso(updatedWeek.weekStart),
              status: String(updatedWeek.status),
              totalHours: computed.totals.paidHours,
              regularHours: computed.totals.regularHours,
              overtimeHours: computed.totals.overtimeTotal,
              overnightCount: computed.totals.overnightCount,
              user: {
                id: updatedWeek.user?.id ?? "",
                name: updatedWeek.user?.name ?? null,
                email: updatedWeek.user?.email ?? "Unknown user",
              },
            }
          : null,
    });
  } catch (e: any) {
    console.error("api/entry/delete POST error:", e);

    return NextResponse.json(
      { error: e?.message ?? "Failed to delete entry" },
      { status: 500 },
    );
  }
}