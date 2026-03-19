export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";

export const dynamic = "force-dynamic";

type EntryLike = {
  id: string;
  date: Date;
  type: string;
  hours: number;
  regularHours: number;
  otMonFriHours: number;
  otSatHours: number;
  otSunBhHours: number;
  overnight: boolean;
  leftEarlyByChoice?: boolean;
  startTime?: string;
  finishTime?: string;
};

function getString(v: unknown) {
  return typeof v === "string" ? v.trim() : "";
}

function startOfWeekMonday(d: Date) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function parseHHMM(value?: string | null) {
  if (!value) return null;
  const m = /^(\d{2}):(\d{2})$/.exec(value);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return hh * 60 + mm;
}

function dayKeyUTC(d: Date) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

async function getOrCreateDevUser() {
  const email = process.env.DEV_USER_EMAIL || "craig@test.com";
  const name = process.env.DEV_USER_NAME || "Craig (Dev)";

  const user =
    (await prisma.user.findUnique({ where: { email } })) ??
    (await prisma.user.create({
      data: { email, name, role: "ENGINEER" },
    }));

  return user;
}

function isWorkingType(type: string) {
  const t = (type || "WORK").toUpperCase();
  return t === "WORK" || t === "TRAINING";
}

function corePaidHoursForDate(d: Date) {
  const dow = d.getDay(); // 0 Sun .. 6 Sat
  if (dow >= 1 && dow <= 4) return 8; // Mon-Thu
  if (dow === 5) return 5; // Fri
  return 0;
}

function coreWindowForDate(d: Date) {
  const dow = d.getDay();
  if (dow >= 1 && dow <= 4) return { start: 8 * 60 + 30, end: 17 * 60 }; // 08:30–17:00
  if (dow === 5) return { start: 8 * 60 + 30, end: 14 * 60 }; // 08:30–14:00
  return null;
}

/**
 * Normal weekday OT rule:
 * - anything before core start or after core finish is weekday OT
 * - only used for normal WORK/TRAINING days
 *
 * If leftEarlyByChoice is true, we DO NOT use this rule.
 * For those days we trust the stored entry buckets instead:
 * - regularHours
 * - otMonFriHours / otSatHours / otSunBhHours
 */
function computeEntryWeekdayOT(entry: EntryLike) {
  if (!isWorkingType(entry.type)) return 0;
  if (entry.leftEarlyByChoice) return 0;

  const date = new Date(entry.date);
  const dow = date.getDay();
  if (dow === 0 || dow === 6) return 0;

  const window = coreWindowForDate(date);
  if (!window) return 0;

  const startMin = parseHHMM(entry.startTime);
  const finishMinRaw = parseHHMM(entry.finishTime);

  if (startMin === null || finishMinRaw === null) return 0;

  let finishMin = finishMinRaw;
  if (finishMin < startMin) finishMin += 24 * 60;

  let otMin = 0;

  if (startMin < window.start) {
    otMin += Math.max(0, Math.min(finishMin, window.start) - startMin);
  }

  if (finishMin > window.end) {
    otMin += Math.max(0, finishMin - Math.max(startMin, window.end));
  }

  return round2(otMin / 60);
}

function computeWeek(entries: EntryLike[]) {
  const byDay = new Map<string, EntryLike[]>();

  for (const e of entries) {
    const key = dayKeyUTC(new Date(e.date));
    byDay.set(key, [...(byDay.get(key) ?? []), e]);
  }

  const hasAnyLeftEarlyByChoice = entries.some(
    (e) => isWorkingType(e.type) && !!e.leftEarlyByChoice
  );

  const days = [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dateIso, list]) => {
      const date = new Date(list[0].date);
      const dow = date.getDay();

      const workingEntries = list.filter((e) => isWorkingType(e.type));
      const hasLeftEarlyWorking = workingEntries.some((e) => !!e.leftEarlyByChoice);

      const workedHours = round2(
        workingEntries.reduce((sum, e) => sum + (Number(e.hours) || 0), 0)
      );

      let regularHours = 0;
      let corePaidHours = 0;
      let otMonFriHours = 0;
      let otSatHours = 0;
      let otSunBhHours = 0;
      let breakHours = 0;

      if (hasLeftEarlyWorking) {
        /**
         * Left early by choice day:
         * - no core top-up
         * - no weekday core-window OT logic
         * - use the stored entry split exactly
         *
         * Example:
         * 05:00–14:00 with leftEarlyByChoice=true
         * => 8 regular + 1 OT
         */
        regularHours = round2(
          list.reduce((sum, e) => sum + (Number(e.regularHours) || 0), 0)
        );
        corePaidHours = regularHours;

        otMonFriHours = round2(
          list.reduce((sum, e) => sum + (Number(e.otMonFriHours) || 0), 0)
        );
        otSatHours = round2(
          list.reduce((sum, e) => sum + (Number(e.otSatHours) || 0), 0)
        );
        otSunBhHours = round2(
          list.reduce((sum, e) => sum + (Number(e.otSunBhHours) || 0), 0)
        );

        breakHours = 0;
      } else {
        if (dow >= 1 && dow <= 5) {
          corePaidHours = corePaidHoursForDate(date);
          regularHours = corePaidHours;

          otMonFriHours = round2(
            list.reduce((sum, e) => {
              if (!isWorkingType(e.type)) return sum;
              return sum + computeEntryWeekdayOT(e);
            }, 0)
          );

          breakHours = workingEntries.length > 0 ? 0.5 : 0;
        } else if (dow === 6) {
          regularHours = 0;
          corePaidHours = 0;
          otSatHours = round2(
            workingEntries.reduce((sum, e) => sum + (Number(e.hours) || 0), 0)
          );
          breakHours = 0;
        } else if (dow === 0) {
          regularHours = 0;
          corePaidHours = 0;
          otSunBhHours = round2(
            workingEntries.reduce((sum, e) => sum + (Number(e.hours) || 0), 0)
          );
          breakHours = 0;
        }
      }

      const paidHours = round2(
        regularHours + otMonFriHours + otSatHours + otSunBhHours
      );

      const overnightCount = list.reduce((acc, e) => acc + (e.overnight ? 1 : 0), 0);

      return {
        date: dateIso,
        workedHours,
        breakHours,
        corePaidHours: round2(corePaidHours),
        paidHours,
        regularHours: round2(regularHours),
        otMonFriHours: round2(otMonFriHours),
        otSatHours: round2(otSatHours),
        otSunBhHours: round2(otSunBhHours),
        overnightCount,
        overnightAllowance: overnightCount * 35,
        leftEarlyByChoice: hasLeftEarlyWorking,
      };
    });

  const totals = days.reduce(
    (acc, d) => {
      acc.workedHours += d.workedHours;
      acc.breakHours += d.breakHours;
      acc.corePaidHours += d.corePaidHours;
      acc.regularHours += d.regularHours;
      acc.otMonFriHours += d.otMonFriHours;
      acc.otSatHours += d.otSatHours;
      acc.otSunBhHours += d.otSunBhHours;
      acc.overnightCount += d.overnightCount;
      acc.overnightAllowance += d.overnightAllowance;
      return acc;
    },
    {
      workedHours: 0,
      breakHours: 0,
      corePaidHours: 0,
      regularHours: 0,
      otMonFriHours: 0,
      otSatHours: 0,
      otSunBhHours: 0,
      overnightCount: 0,
      overnightAllowance: 0,
    }
  );

  /**
   * Business top-up:
   * - normal weeks get +0.5
   * - if the employee has any "left early by choice" working entry that week,
   *   do not add the free 0.5
   */
  const businessTopUpHours = hasAnyLeftEarlyByChoice ? 0 : 0.5;
  const overtimeTotal = round2(totals.otMonFriHours + totals.otSatHours + totals.otSunBhHours);
  const paidHours = round2(totals.regularHours + businessTopUpHours + overtimeTotal);

  return {
    days,
    totals: {
      workedHours: round2(totals.workedHours),
      breakHours: round2(totals.breakHours),
      corePaidHours: round2(totals.corePaidHours),
      businessTopUpHours: round2(businessTopUpHours),
      paidHours,
      regularHours: round2(totals.regularHours),
      otMonFriHours: round2(totals.otMonFriHours),
      otSatHours: round2(totals.otSatHours),
      otSunBhHours: round2(totals.otSunBhHours),
      overtimeTotal,
      overnightCount: totals.overnightCount,
      overnightAllowance: round2(totals.overnightAllowance),
      hasAnyLeftEarlyByChoice,
    },
    rules: {
      weeklyCorePaidHours: 37,
      businessTopUpHours: round2(businessTopUpHours),
      monThu: { coreWindow: "08:30-17:00", corePaidHours: 8 },
      fri: { coreWindow: "08:30-14:00", corePaidHours: 5 },
      unpaidBreakHours: 0.5,
      workingTypes: ["WORK", "TRAINING"],
      leftEarlyByChoice:
        "No core top-up. Pay stored regular hours plus stored overtime only.",
    },
  };
}

export async function GET(req: Request) {
  try {
    const user = await getOrCreateDevUser();

    const url = new URL(req.url);
    const weekStartParam = getString(url.searchParams.get("weekStart"));

    const requested =
      weekStartParam && !Number.isNaN(new Date(weekStartParam).getTime())
        ? new Date(weekStartParam)
        : null;

    const weekStart = requested ? startOfWeekMonday(requested) : startOfWeekMonday(new Date());

    let existing = await prisma.timesheetWeek.findUnique({
      where: {
        userId_weekStart: {
          userId: user.id,
          weekStart,
        },
      },
      include: {
        entries: {
          orderBy: [{ date: "asc" }, { createdAt: "asc" }],
        },
      },
    });

    if (!existing) {
      existing = await prisma.timesheetWeek.create({
        data: {
          userId: user.id,
          weekStart,
          status: "DRAFT",
        },
        include: {
          entries: {
            orderBy: [{ date: "asc" }, { createdAt: "asc" }],
          },
        },
      });
    }

    const computed = computeWeek(existing.entries as EntryLike[]);
console.log(
  existing.entries.map((e: any) => ({
    id: e.id,
    date: e.date,
    startTime: e.startTime,
    finishTime: e.finishTime,
    hours: e.hours,
    regularHours: e.regularHours,
    otMonFriHours: e.otMonFriHours,
    leftEarlyByChoice: e.leftEarlyByChoice,
  }))
);
    return NextResponse.json({
      week: existing,
      computed,
      user: { id: user.id, name: user.name ?? null, email: user.email },
    });
  } catch (e: any) {
    console.error("api/week GET error:", e);
    return NextResponse.json({ error: e?.message ?? "Failed to load week" }, { status: 500 });
  }
}