export const runtime = "nodejs";

import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";

const WORKING_TYPES = new Set(["WORK", "TRAINING"]);
const BREAK_THRESHOLD_HOURS = 8;
const BREAK_HOURS = 0.5;

export async function GET() {
  try {
    const session = await auth();

    if (!session?.user?.email) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: {
        id: true,
        role: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 403 });
    }

    if (user.role !== "ADMIN" && user.role !== "ACCOUNTS") {
      return NextResponse.json(
        { error: "Not authorised to view submitted weeks" },
        { status: 403 }
      );
    }

    const weeks = await prisma.timesheetWeek.findMany({
      where: { status: "SUBMITTED" },
      orderBy: { weekStart: "desc" },
      include: {
        user: { select: { id: true, name: true, email: true } },
        entries: { select: { date: true, type: true, hours: true } },
      },
      take: 100,
    });

    const formatted = weeks.map((w) => {
      const entries = w.entries ?? [];

      const totalHours = round2(
        entries.reduce((sum, e) => sum + (Number(e.hours) || 0), 0)
      );

      const workingEntries = entries.filter((e) =>
        WORKING_TYPES.has(String(e.type || "WORK").toUpperCase())
      );
      const workingHours = round2(
        workingEntries.reduce((sum, e) => sum + (Number(e.hours) || 0), 0)
      );

      const byDay = new Map<string, number>();
      for (const e of workingEntries) {
        const k = dayKeyUTC(e.date);
        byDay.set(k, (byDay.get(k) ?? 0) + (Number(e.hours) || 0));
      }

      let breakHours = 0;
      for (const dayWorked of byDay.values()) {
        if (dayWorked >= BREAK_THRESHOLD_HOURS) breakHours += BREAK_HOURS;
      }
      breakHours = round2(breakHours);

      const paidHours = round2(Math.max(0, workingHours - breakHours));

      return {
        id: w.id,
        weekStart: w.weekStart,
        status: w.status,
        totalHours,
        workingHours,
        breakHours,
        paidHours,
        user: w.user,
      };
    });

    return NextResponse.json({
      weeks: formatted,
      rules: {
        workingTypes: Array.from(WORKING_TYPES),
        breakThresholdHours: BREAK_THRESHOLD_HOURS,
        breakHours: BREAK_HOURS,
        unpaid: true,
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Failed to load submitted weeks" },
      { status: 500 }
    );
  }
}

function dayKeyUTC(d: Date | string) {
  const dt = typeof d === "string" ? new Date(d) : d;
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const day = String(dt.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}