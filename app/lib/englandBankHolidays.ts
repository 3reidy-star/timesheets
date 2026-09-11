// app/lib/englandBankHolidays.ts
// England & Wales bank holidays used by the timesheets payroll rules.
// Standard dates are calculated so future years continue to work automatically.
// One-off bank holidays are listed separately when required.

export type EnglandBankHoliday = {
  date: string;
  name: string;
};

function isoDate(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function utcDate(year: number, monthIndex: number, day: number) {
  return new Date(Date.UTC(year, monthIndex, day));
}

function dateKey(date: Date) {
  return isoDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

function addDays(date: Date, days: number) {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function firstMonday(year: number, monthIndex: number) {
  const date = utcDate(year, monthIndex, 1);
  const offset = (8 - date.getUTCDay()) % 7;
  return addDays(date, offset);
}

function lastMonday(year: number, monthIndex: number) {
  const date = utcDate(year, monthIndex + 1, 0);
  const offset = (date.getUTCDay() + 6) % 7;
  return addDays(date, -offset);
}

// Anonymous Gregorian algorithm.
function easterSunday(year: number) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return utcDate(year, month - 1, day);
}

function newYearsDay(year: number): EnglandBankHoliday {
  const jan1 = utcDate(year, 0, 1);
  const dow = jan1.getUTCDay();
  const observed = dow === 6 ? addDays(jan1, 2) : dow === 0 ? addDays(jan1, 1) : jan1;
  return {
    date: dateKey(observed),
    name: observed.getTime() === jan1.getTime() ? "New Year’s Day" : "New Year’s Day (substitute day)",
  };
}

function christmasAndBoxingDay(year: number): EnglandBankHoliday[] {
  const christmas = utcDate(year, 11, 25);
  const boxing = utcDate(year, 11, 26);
  const christmasDow = christmas.getUTCDay();
  const boxingDow = boxing.getUTCDay();

  if (christmasDow === 6) {
    return [
      { date: dateKey(addDays(christmas, 2)), name: "Christmas Day (substitute day)" },
      { date: dateKey(addDays(boxing, 2)), name: "Boxing Day (substitute day)" },
    ];
  }

  if (christmasDow === 0) {
    return [
      { date: dateKey(addDays(christmas, 2)), name: "Christmas Day (substitute day)" },
      { date: dateKey(addDays(boxing, 0)), name: "Boxing Day" },
    ];
  }

  if (boxingDow === 6) {
    return [
      { date: dateKey(christmas), name: "Christmas Day" },
      { date: dateKey(addDays(boxing, 2)), name: "Boxing Day (substitute day)" },
    ];
  }

  if (boxingDow === 0) {
    return [
      { date: dateKey(christmas), name: "Christmas Day" },
      { date: dateKey(addDays(boxing, 1)), name: "Boxing Day (substitute day)" },
    ];
  }

  return [
    { date: dateKey(christmas), name: "Christmas Day" },
    { date: dateKey(boxing), name: "Boxing Day" },
  ];
}

const ONE_OFF_BANK_HOLIDAYS: Record<number, EnglandBankHoliday[]> = {
  2022: [
    { date: "2022-06-03", name: "Platinum Jubilee bank holiday" },
    { date: "2022-09-19", name: "Bank Holiday for the State Funeral of Queen Elizabeth II" },
  ],
  2023: [{ date: "2023-05-08", name: "Bank holiday for the coronation of King Charles III" }],
};

export function englandBankHolidaysForYear(year: number): EnglandBankHoliday[] {
  const easter = easterSunday(year);

  const holidays: EnglandBankHoliday[] = [
    newYearsDay(year),
    { date: dateKey(addDays(easter, -2)), name: "Good Friday" },
    { date: dateKey(addDays(easter, 1)), name: "Easter Monday" },
    { date: dateKey(firstMonday(year, 4)), name: "Early May bank holiday" },
    { date: dateKey(lastMonday(year, 4)), name: "Spring bank holiday" },
    { date: dateKey(lastMonday(year, 7)), name: "Summer bank holiday" },
    ...christmasAndBoxingDay(year),
    ...(ONE_OFF_BANK_HOLIDAYS[year] ?? []),
  ];

  return holidays.sort((a, b) => a.date.localeCompare(b.date));
}

export function getEnglandBankHoliday(value: Date | string): EnglandBankHoliday | null {
  const date = typeof value === "string" ? new Date(`${value.slice(0, 10)}T00:00:00Z`) : value;
  if (Number.isNaN(date.getTime())) return null;

  const key = dateKey(date);
  const year = date.getUTCFullYear();
  return englandBankHolidaysForYear(year).find((holiday) => holiday.date === key) ?? null;
}

export function isEnglandBankHoliday(value: Date | string) {
  return getEnglandBankHoliday(value) !== null;
}
