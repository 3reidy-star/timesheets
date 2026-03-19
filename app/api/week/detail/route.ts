export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";

function getString(v: unknown) {
  return typeof v === "string" ? v.trim() : "";
}

const WORKING_TYPES = new Set(["WORK", "TRAINING"]);
const BREAK_THRESHOLD_HOURS = 8;
const BREAK_HOURS = 0.5;

export async function GET(req: Request) {
  try {
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

    // Existing totals (leave as-is so no other UI breaks)
    const totals = {
      hours: round2(entries.reduce((s, e) => s + (Number((e as any).hours) || 0), 0)),
      regular: round2(entries.reduce((s, e) => s + (Number((e as any).regularHours) || 0), 0)),
      otMonFri: round2(entries.reduce((s, e) => s + (Number((e as any).otMonFriHours) || 0), 0)),
      otSat: round2(entries.reduce((s, e) => s + (Number((e as any).otSatHours) || 0), 0)),
      otSunBh: round2(entries.reduce((s, e) => s + (Number((e as any).otSunBhHours) || 0), 0)),
    };

    // NEW: break + paid totals computed per day (WORK + TRAINING count as "working")
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

        // add these without removing anything
        computed,
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Failed to load week detail" },
      { status: 500 }
    );
  }
}

/**
 * Break rule:
 * - For each day: if workingHours (WORK + TRAINING) >= 8, deduct 0.5 unpaid break once.
 * - Travel is included in working hours per your rule; in your schema travel is just WORK hours.
 */
function computePaidAndBreak(entries: any[]) {
  const byDay = new Map<string, any[]>();

  for (const e of entries) {
    const k = dayKeyUTC(e.date);
    byDay.set(k, [...(byDay.get(k) ?? []), e]);
  }

  const days = [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, dayEntries]) => {
      const workingHours = dayEntries
        .filter((x) => WORKING_TYPES.has(String(x.type)))
        .reduce((s, x) => s + (Number(x.hours) || 0), 0);

      const breakHours = workingHours >= BREAK_THRESHOLD_HOURS ? BREAK_HOURS : 0;
      const paidHours = Math.max(0, workingHours - breakHours);

      return {
        date, // YYYY-MM-DD
        workingHours: round2(workingHours),
        breakHours: round2(breakHours),
        paidHours: round2(paidHours),
      };
    });

  const totals = days.reduce(
    (acc, d) => {
      acc.workingHours += d.workingHours;
      acc.breakHours += d.breakHours;
      acc.paidHours += d.paidHours;
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

// Stable day key in UTC so dates don't drift with timezone
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