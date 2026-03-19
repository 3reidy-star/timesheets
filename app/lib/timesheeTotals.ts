// app/lib/timesheetTotals.ts

export const BREAK_THRESHOLD_HOURS = 8;
export const BREAK_HOURS = 0.5;

// What counts as "working" for break + pay
export const WORKING_TYPES = new Set(["WORK", "TRAINING"]);

// Build a stable YYYY-MM-DD key without timezone surprises
// (uses UTC parts so it won't shift a day on UK machines)
export function dayKeyUTC(d: Date | string) {
  const dt = typeof d === "string" ? new Date(d) : d;
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const day = String(dt.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

type EntryLike = {
  date: Date | string;
  type: string;
  hours: number;
  regularHours?: number;
  otMonFriHours?: number;
  otSatHours?: number;
  otSunBhHours?: number;
};

export function calcDayTotals(entries: EntryLike[]) {
  const workedHours = entries
    .filter(e => WORKING_TYPES.has(e.type))
    .reduce((sum, e) => sum + (Number(e.hours) || 0), 0);

  const breakHours = workedHours >= BREAK_THRESHOLD_HOURS ? BREAK_HOURS : 0;
  const paidHours = Math.max(0, workedHours - breakHours);

  return { workedHours, breakHours, paidHours };
}

export function calcWeekTotals(entries: EntryLike[]) {
  const byDay = new Map<string, EntryLike[]>();

  for (const e of entries) {
    const k = dayKeyUTC(e.date);
    byDay.set(k, [...(byDay.get(k) ?? []), e]);
  }

  const days = [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, dayEntries]) => ({
      date,
      ...calcDayTotals(dayEntries),
      entries: dayEntries,
    }));

  const totals = days.reduce(
    (acc, d) => {
      acc.workedHours += d.workedHours;
      acc.breakHours += d.breakHours;
      acc.paidHours += d.paidHours;
      return acc;
    },
    { workedHours: 0, breakHours: 0, paidHours: 0 }
  );

  return { days, totals };
}