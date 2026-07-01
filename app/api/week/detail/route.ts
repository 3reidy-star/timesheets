export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";

function getString(v: unknown) {
  return typeof v === "string" ? v.trim() : "";
}

function toNumber(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value) || 0;
  if (value && typeof value === "object" && "toNumber" in value) {
    return (value as { toNumber: () => number }).toNumber();
  }
  return 0;
}

const WORKING_TYPES = new Set(["WORK", "TRAINING"]);
const BREAK_THRESHOLD_HOURS = 8;
const BREAK_HOURS = 0.5;

export async function GET(req: Request) {
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
        { error: "Not authorised to view week detail" },
        { status: 403 }
      );
    }

    const url = new URL(req.url);
    const weekId = getString(url.searchParams.get("weekId"));

    if (!weekId) {
      return NextResponse.json({ error: "weekId is required" }, { status: 400 });
    }

    const week = await prisma.timesheetWeek.findUnique({
      where: { id: weekId },
      include: {
        user: { select: { id: true, name: true, email: true } },
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

    if (!week) {
      return NextResponse.json({ error: "Week not found" }, { status: 404 });
    }

    const entries = week.entries ?? [];

    const totals = {
      hours: round2(entries.reduce((s, e) => s + toNumber(e.hours), 0)),
      regular: round2(entries.reduce((s, e) => s + toNumber(e.regularHours), 0)),
      otMonFri: round2(entries.reduce((s, e) => s + toNumber(e.otMonFriHours), 0)),
      otSat: round2(entries.reduce((s, e) => s + toNumber(e.otSatHours), 0)),
      otSunBh: round2(entries.reduce((s, e) => s + toNumber(e.otSunBhHours), 0)),
    };

    const computed = computePaidAndBreak(entries);

    return NextResponse.json({
      ok: true,
      week: {
        id: week.id,
        weekStart: week.weekStart,
        status: week.status,
        user: week.user,
        entries: week.entries,
        audits: week.audits,
        totals,
        computed,
      },
    });
  } catch (err: any) {
    console.error("api/week/detail error:", err);
    return NextResponse.json(
      { error: err?.message ?? "Failed to load week detail" },
      { status: 500 }
    );
  }
}

function computePaidAndBreak(entries: any[]) {
  const byDay = new Map<string, any[]>();

  for (const entry of entries) {
    const key = dayKeyUTC(entry.date);
    const existing = byDay.get(key) ?? [];
    existing.push(entry);
    byDay.set(key, existing);
  }

  const days = [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, dayEntries]) => {
      const workingHours = dayEntries
        .filter((entry) => WORKING_TYPES.has(String(entry.type)))
        .reduce((sum, entry) => sum + toNumber(entry.hours), 0);

      const regularHours = dayEntries.reduce(
        (sum, entry) => sum + toNumber(entry.regularHours),
        0
      );

      const overtimeHours = dayEntries.reduce(
        (sum, entry) =>
          sum +
          toNumber(entry.otMonFriHours) +
          toNumber(entry.otSatHours) +
          toNumber(entry.otSunBhHours),
        0
      );

      const paidHours = round2(regularHours + overtimeHours);

      const breakHours =
  workingHours >= BREAK_THRESHOLD_HOURS ? BREAK_HOURS : 0;

      return {
        date,
        workingHours: round2(workingHours),
        breakHours: round2(breakHours),
        paidHours,
      };
    });

  const totals = days.reduce(
    (acc, day) => {
      acc.workingHours += day.workingHours;
      acc.breakHours += day.breakHours;
      acc.paidHours += day.paidHours;
      return acc;
    },
    { workingHours: 0, breakHours: 0, paidHours: 0 }
  );

  return {
    days,
    totals: {
      workingHours: round2(totals.workingHours),
      breakHours: round2(totals.breakHours),
      paidHours: round2(totals.paidHours),
    },
    rules: {
      workingTypes: Array.from(WORKING_TYPES),
      breakThresholdHours: BREAK_THRESHOLD_HOURS,
      breakHours: BREAK_HOURS,
      unpaid: true,
    },
  };
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