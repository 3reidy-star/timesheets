export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";

export const dynamic = "force-dynamic";

type EntryType = "WORK" | "HOLIDAY_FULL" | "HOLIDAY_HALF" | "SICK" | "TRAINING";

function toString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function toDate(value: unknown, field: string) {
  const s = typeof value === "string" ? value.trim() : "";
  const d = new Date(s);
  if (!s || Number.isNaN(d.getTime())) throw new Error(`${field} must be a valid date`);
  return d;
}

function toHHMM(value: unknown, fallback: string) {
  const s = typeof value === "string" ? value.trim() : "";
  if (!/^\d{2}:\d{2}$/.test(s)) return fallback;
  return s;
}

function parseHHMM(value: string) {
  const m = /^(\d{2}):(\d{2})$/.exec(value);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return hh * 60 + mm;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function toNullableNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  return n;
}

function toBoolean(value: unknown) {
  return value === true || value === "true" || value === 1 || value === "1";
}

/**
 * Paid standard hours for non-work types.
 * Mon–Thu: 8.0 paid
 * Fri: 5.0 paid
 */
function standardPaidHoursForDate(date: Date) {
  const dow = date.getDay(); // 0 Sun .. 6 Sat
  if (dow >= 1 && dow <= 4) return 8;
  if (dow === 5) return 5;
  return 0;
}

function standardTimesForDate(date: Date) {
  const dow = date.getDay();
  if (dow === 5) return { start: "08:30", finish: "14:00" };
  return { start: "08:30", finish: "17:00" };
}

function halfDayTimesForDate(date: Date, half: "AM" | "PM") {
  const dow = date.getDay();

  if (dow === 5) {
    return half === "PM"
      ? { start: "11:30", finish: "14:00" }
      : { start: "08:30", finish: "11:00" };
  }

  return half === "PM"
    ? { start: "13:00", finish: "17:00" }
    : { start: "08:30", finish: "12:30" };
}

function getRegularCapForDate(date: Date) {
  const dow = date.getDay();
  if (dow >= 1 && dow <= 4) return 8;
  if (dow === 5) return 5;
  return 0;
}

function calcWorkHours(
  date: Date,
  startTime: string,
  finishTime: string,
  leftEarlyByChoice: boolean
) {
  const startMin = parseHHMM(startTime);
  const finishMinRaw = parseHHMM(finishTime);
  if (startMin === null) throw new Error("Invalid startTime");
  if (finishMinRaw === null) throw new Error("Invalid finishTime");

  let finishMin = finishMinRaw;
  if (finishMinRaw < startMin) finishMin += 24 * 60;

  const durationMin = finishMin - startMin;
  if (durationMin <= 0) throw new Error("Finish must be after start");

  let total = durationMin / 60;

  if (!leftEarlyByChoice && total >= 6) {
    total -= 0.5;
  }

  total = Math.max(0, total);

  const hours = round2(total);
  const regularCap = getRegularCapForDate(date);

  const regularHours = round2(Math.min(regularCap, total));
  const ot = round2(Math.max(0, total - regularCap));

  let otMonFriHours = 0;
  let otSatHours = 0;
  let otSunBhHours = 0;

  const dow = date.getDay();
  if (dow === 6) otSatHours = ot;
  else if (dow === 0) otSunBhHours = ot;
  else otMonFriHours = ot;

  return { hours, regularHours, otMonFriHours, otSatHours, otSunBhHours };
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const id = toString(body?.id);
    if (!id) return NextResponse.json({ error: "Missing entry id" }, { status: 400 });

    const existing = await prisma.timesheetEntry.findUnique({
      where: { id },
      select: { id: true, week: { select: { status: true } } },
    });

    if (!existing) return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    if (existing.week?.status !== "DRAFT") {
      return NextResponse.json({ error: "Week is locked and cannot be edited" }, { status: 400 });
    }

    const type = (toString(body?.type) || "WORK").toUpperCase() as EntryType;
    const date = toDate(body?.date, "date");

    const job = toString(body?.job);
    const description = typeof body?.description === "string" ? body.description.trim() : null;
    const agreedRate = toNullableNumber(body?.agreedRate);

    const overnightAllowance = !!body?.overnight;
    const leftEarlyByChoice = toBoolean(body?.leftEarlyByChoice);

    const defaultWorkTimes = standardTimesForDate(date);

    let startTime = defaultWorkTimes.start;
    let finishTime = defaultWorkTimes.finish;

    let hours = 0;
    let regularHours = 0;
    let otMonFriHours = 0;
    let otSatHours = 0;
    let otSunBhHours = 0;

    if (type === "WORK") {
      if (!job) throw new Error("Job / Site is required for Work entries");

      startTime = toHHMM(body?.startTime, defaultWorkTimes.start);
      finishTime = toHHMM(body?.finishTime, defaultWorkTimes.finish);

      const calc = calcWorkHours(date, startTime, finishTime, leftEarlyByChoice);
      hours = calc.hours;
      regularHours = calc.regularHours;
      otMonFriHours = calc.otMonFriHours;
      otSatHours = calc.otSatHours;
      otSunBhHours = calc.otSunBhHours;
    } else {
      const base = standardPaidHoursForDate(date);

      if (type === "HOLIDAY_HALF") {
        hours = round2(base / 2);
        regularHours = hours;

        const half = (toString(body?.halfDay).toUpperCase() as "AM" | "PM" | "") || "AM";
        const times = halfDayTimesForDate(date, half === "PM" ? "PM" : "AM");
        startTime = times.start;
        finishTime = times.finish;
      } else {
        hours = round2(base);
        regularHours = hours;

        const times = standardTimesForDate(date);
        startTime = times.start;
        finishTime = times.finish;
      }

      otMonFriHours = 0;
      otSatHours = 0;
      otSunBhHours = 0;
    }

    await prisma.timesheetEntry.update({
      where: { id },
      data: {
        date,
        type,
        job: job || "",
        description,
        agreedRate,
        startTime,
        finishTime,
        overnight: overnightAllowance,
        hours,
        regularHours,
        otMonFriHours,
        otSatHours,
        otSunBhHours,
        leftEarlyByChoice: type === "WORK" ? leftEarlyByChoice : false,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("api/entry/update POST error:", e);
    return NextResponse.json({ error: e?.message ?? "Failed to update entry" }, { status: 500 });
  }
}