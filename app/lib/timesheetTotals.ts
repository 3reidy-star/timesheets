// app/lib/timesheetTotals.ts

import { getEnglandBankHoliday } from "@/app/lib/englandBankHolidays";

export const BREAK_THRESHOLD_HOURS = 8;
export const BREAK_HOURS = 0.5;
export const BUSINESS_TOP_UP_HOURS = 0.5;

export const WORKING_TYPES = new Set(["WORK", "TRAINING"]);
export const PAID_NON_WORKING_TYPES = new Set([
  "HOLIDAY_FULL",
  "HOLIDAY_HALF",
  "SICK",
]);

export type TimesheetEntryForTotals = {
  id?: string;
  date: Date | string;
  type: string;
  hours: number;
  regularHours?: number;
  otMonFriHours?: number;
  otSatHours?: number;
  otSunBhHours?: number;
  overnight?: boolean;
  leftEarlyByChoice?: boolean;
  jobAndKnock?: boolean;
  startTime?: string | null;
  finishTime?: string | null;
};

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export function dayKeyUTC(d: Date | string) {
  const dt = typeof d === "string" ? new Date(d) : d;
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const day = String(dt.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseHHMM(value?: string | null) {
  if (!value) return null;
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;

  const hh = Number(match[1]);
  const mm = Number(match[2]);

  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return hh * 60 + mm;
}

function isWorkingType(type: string) {
  return WORKING_TYPES.has((type || "WORK").toUpperCase());
}

function isPaidNonWorkingType(type: string) {
  return PAID_NON_WORKING_TYPES.has((type || "").toUpperCase());
}

function corePaidHoursForDate(date: Date) {
  const dow = date.getUTCDay();
  if (dow >= 1 && dow <= 4) return 8;
  if (dow === 5) return 5;
  return 0;
}

function coreWindowForDate(date: Date) {
  const dow = date.getUTCDay();

  if (dow >= 1 && dow <= 4) {
    return { start: 8 * 60 + 30, end: 17 * 60 };
  }

  if (dow === 5) {
    return { start: 8 * 60 + 30, end: 14 * 60 };
  }

  return null;
}

function computeEntryWeekdayOT(entry: TimesheetEntryForTotals) {
  if (!isWorkingType(entry.type)) return 0;
  if (entry.leftEarlyByChoice) return 0;
  if (entry.jobAndKnock) return 0;

  const date = new Date(entry.date);
  const dow = date.getUTCDay();

  if (dow === 0 || dow === 6) return 0;

  const window = coreWindowForDate(date);
  if (!window) return 0;

  const startMin = parseHHMM(entry.startTime);
  const finishMinRaw = parseHHMM(entry.finishTime);

  if (startMin === null || finishMinRaw === null) {
    return Number(entry.otMonFriHours) || 0;
  }

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

type PayrollEmployee = { name?: string | null };

export function usesActualHours(employee?: PayrollEmployee) {
  const name = employee?.name?.trim().replace(/\s+/g, " ").toLowerCase();
  return name === "becky lawrence";
}

export function calcWeekTotals(
  entries: TimesheetEntryForTotals[],
  _weekStartInput?: Date | string | null,
  employee?: PayrollEmployee,
) {
  const actualHoursOnly = usesActualHours(employee);
  const byDay = new Map<string, TimesheetEntryForTotals[]>();

  for (const storedEntry of entries) {
    let entry = storedEntry;
    if (actualHoursOnly && isWorkingType(entry.type) && entry.jobAndKnock) {
      const start = parseHHMM(entry.startTime);
      const finish = parseHHMM(entry.finishTime);
      if (start !== null && finish !== null) {
        const spanHours = ((finish < start ? finish + 1440 : finish) - start) / 60;
        const breakHours = !entry.leftEarlyByChoice && spanHours >= 6 ? BREAK_HOURS : 0;
        entry = { ...entry, hours: round2(Math.max(0, spanHours - breakHours)), jobAndKnock: false };
      }
    }
    const key = dayKeyUTC(entry.date);
    byDay.set(key, [...(byDay.get(key) ?? []), entry]);
  }

  const days = [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dateIso, list]) => {
      const date = new Date(`${dateIso}T00:00:00Z`);
      const dow = date.getUTCDay();
      const bankHoliday = getEnglandBankHoliday(date);

      const workingEntries = list.filter((entry) => isWorkingType(entry.type));
      const paidNonWorkingEntries = list.filter((entry) =>
        isPaidNonWorkingType(entry.type),
      );

      const workedHours = round2(
        workingEntries.reduce(
          (sum, entry) => sum + (Number(entry.hours) || 0),
          0,
        ),
      );

      const paidNonWorkingHours = round2(
        paidNonWorkingEntries.reduce(
          (sum, entry) => sum + (Number(entry.hours) || 0),
          0,
        ),
      );

      const hasLeftEarlyWorking = workingEntries.some(
        (entry) => !!entry.leftEarlyByChoice,
      );

      const hasJobAndKnockWorking = workingEntries.some(
        (entry) => !!entry.jobAndKnock,
      );

      let breakHours = 0;
      let regularHours = 0;
      let corePaidHours = 0;
      let otMonFriHours = 0;
      let otSatHours = 0;
      let otSunBhHours = 0;

      if (actualHoursOnly) {
        // Stored hours already include the entry's break deduction. Never
        // inflate these to a standard day or apply job-and-knock guarantees.
        regularHours = paidNonWorkingHours;
        if (bankHoliday || dow === 0) otSunBhHours = workedHours;
        else if (dow === 6) otSatHours = workedHours;
        else {
          otMonFriHours = round2(Math.min(workedHours, workingEntries.reduce(
            (sum, entry) => sum + computeEntryWeekdayOT(entry), 0,
          )));
          regularHours = round2(regularHours + workedHours - otMonFriHours);
        }
        corePaidHours = regularHours;
        breakHours = round2(workingEntries.reduce((sum, entry) => {
          const start = parseHHMM(entry.startTime);
          const finish = parseHHMM(entry.finishTime);
          if (start === null || finish === null) return sum;
          const span = (finish < start ? finish + 1440 : finish) - start;
          return sum + Math.max(0, span / 60 - (Number(entry.hours) || 0));
        }, 0));
      } else if (bankHoliday) {
        // Holiday pay requires an explicit paid non-working entry. A calendar
        // bank holiday alone does not establish an employee's entitlement.
        regularHours = paidNonWorkingHours;
        corePaidHours = regularHours;
        otSunBhHours = workedHours;
        breakHours = workingEntries.length > 0 ? BREAK_HOURS : 0;
      } else if (hasLeftEarlyWorking || hasJobAndKnockWorking) {
        regularHours = round2(
          list.reduce(
            (sum, entry) => sum + (Number(entry.regularHours) || 0),
            0,
          ) + paidNonWorkingHours,
        );

        corePaidHours = regularHours;

        otMonFriHours = round2(
          list.reduce(
            (sum, entry) => sum + (Number(entry.otMonFriHours) || 0),
            0,
          ),
        );

        otSatHours = round2(
          list.reduce(
            (sum, entry) => sum + (Number(entry.otSatHours) || 0),
            0,
          ),
        );

        otSunBhHours = round2(
          list.reduce(
            (sum, entry) => sum + (Number(entry.otSunBhHours) || 0),
            0,
          ),
        );
      } else if (dow >= 1 && dow <= 5) {
        if (workingEntries.length > 0) {
          corePaidHours = corePaidHoursForDate(date);
          regularHours = corePaidHours;

          otMonFriHours = round2(
            workingEntries.reduce(
              (sum, entry) => sum + computeEntryWeekdayOT(entry),
              0,
            ),
          );

          breakHours = workingEntries.length > 0 ? BREAK_HOURS : 0;
        } else {
          regularHours = paidNonWorkingHours;
          corePaidHours = paidNonWorkingHours;
        }
      } else if (dow === 6) {
        regularHours = paidNonWorkingHours;
        corePaidHours = paidNonWorkingHours;

        otSatHours = round2(
          workingEntries.reduce(
            (sum, entry) => sum + (Number(entry.hours) || 0),
            0,
          ),
        );
      } else if (dow === 0) {
        regularHours = paidNonWorkingHours;
        corePaidHours = paidNonWorkingHours;

        otSunBhHours = round2(
          workingEntries.reduce(
            (sum, entry) => sum + (Number(entry.hours) || 0),
            0,
          ),
        );
      }

      const paidHours = round2(
        regularHours + otMonFriHours + otSatHours + otSunBhHours,
      );

      const overnightCount = list.filter((entry) =>
        Boolean(entry.overnight),
      ).length;

      return {
        date: dateIso,
        workedHours,
        breakHours: round2(breakHours),
        paidHours,
        corePaidHours: round2(corePaidHours),
        regularHours: round2(regularHours),
        otMonFriHours: round2(otMonFriHours),
        otSatHours: round2(otSatHours),
        otSunBhHours: round2(otSunBhHours),
        overtimeTotal: round2(otMonFriHours + otSatHours + otSunBhHours),
        overnightCount,
        overnightAllowance: overnightCount * 35,
        leftEarlyByChoice: hasLeftEarlyWorking,
        jobAndKnock: hasJobAndKnockWorking,
        bankHoliday: Boolean(bankHoliday),
        bankHolidayName: bankHoliday?.name ?? null,
        entries: list,
      };
    });

  const totals = days.reduce(
    (acc, day) => {
      acc.workedHours += day.workedHours;
      acc.breakHours += day.breakHours;
      acc.corePaidHours += day.corePaidHours;
      acc.regularHours += day.regularHours;
      acc.otMonFriHours += day.otMonFriHours;
      acc.otSatHours += day.otSatHours;
      acc.otSunBhHours += day.otSunBhHours;
      acc.overtimeTotal += day.overtimeTotal;
      acc.overnightCount += day.overnightCount;
      acc.overnightAllowance += day.overnightAllowance;
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
      overtimeTotal: 0,
      overnightCount: 0,
      overnightAllowance: 0,
    },
  );

  const hasAnyLeftEarlyByChoice = days.some((day) => day.leftEarlyByChoice);
  // Alex Smith's agreed pay excludes the weekly half-hour top-up.
  const employeeName = employee?.name?.trim().replace(/\s+/g, " ").toLowerCase();
  const receivesBusinessTopUp = employeeName !== "alex smith" && !actualHoursOnly;
  const businessTopUpHours = !receivesBusinessTopUp || hasAnyLeftEarlyByChoice || days.length === 0 ? 0 : BUSINESS_TOP_UP_HOURS;

  return {
    days,
    totals: {
      workedHours: round2(totals.workedHours),
      breakHours: round2(totals.breakHours),
      corePaidHours: round2(totals.corePaidHours),
      regularHours: round2(totals.regularHours),
      otMonFriHours: round2(totals.otMonFriHours),
      otSatHours: round2(totals.otSatHours),
      otSunBhHours: round2(totals.otSunBhHours),
      overtimeTotal: round2(totals.overtimeTotal),
      businessTopUpHours: round2(businessTopUpHours),
      paidHours: round2(
        totals.regularHours + totals.overtimeTotal + businessTopUpHours,
      ),
      overnightCount: totals.overnightCount,
      overnightAllowance: round2(totals.overnightAllowance),
      hasAnyLeftEarlyByChoice,
    },
    rules: {
      actualHoursOnly,
      weeklyCorePaidHours: 37,
      businessTopUpHours,
      monThu: { coreWindow: "08:30-17:00", corePaidHours: 8 },
      fri: { coreWindow: "08:30-14:00", corePaidHours: 5 },
      unpaidBreakHours: BREAK_HOURS,
      workingTypes: ["WORK", "TRAINING"],
      paidNonWorkingTypes: ["HOLIDAY_FULL", "HOLIDAY_HALF", "SICK"],
      bankHolidays: "Bank-holiday pay requires an entered holiday line; work performed is Sun/BH overtime.",
    },
  };
}
