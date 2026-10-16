import { dayKeyUTC } from "@/app/lib/timesheetTotals";

type ApprovalWeek = {
  status: string;
  dayApprovals: { date: Date | string; status: string }[];
};

export function isPayrollDayApproved(week: ApprovalWeek, date: Date | string) {
  return week.status === "APPROVED" || week.dayApprovals.some(
    (day) => day.status === "APPROVED" && dayKeyUTC(day.date) === dayKeyUTC(date),
  );
}

export function payrollPeriod(today = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(today);
  const part = (name: string) => Number(parts.find((item) => item.type === name)?.value);
  const year = part("year");
  const endMonth = part("month") - 1 + (part("day") >= 16 ? 1 : 0);
  return {
    from: dayKeyUTC(new Date(Date.UTC(year, endMonth - 1, 16))),
    to: dayKeyUTC(new Date(Date.UTC(year, endMonth, 15))),
  };
}

export function parsePayrollDate(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && dayKeyUTC(date) === value ? date : null;
}
