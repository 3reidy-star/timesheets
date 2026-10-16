"use client";

import Link from "next/link";
import { Fragment, useMemo, useState } from "react";

export type ApprovalEntry = {
  id: string;
  date: string;
  type: string;
  job: string;
  description: string | null;
  startTime: string;
  finishTime: string;
  hours: number;
  regularHours: number;
  otMonFriHours: number;
  otSatHours: number;
  otSunBhHours: number;
  overnight: boolean;
};

export type ApprovalComputedDay = {
  date: string;
  workedHours: number;
  breakHours: number;
  paidHours: number;
  regularHours: number;
  otMonFriHours: number;
  otSatHours: number;
  otSunBhHours: number;
  overnightCount: number;
};

export type ApprovalWeek = {
  id: string;
  weekStart: string;
  status: string;
  dayApprovals: { date: string; status: string; comment: string | null }[];
  user: {
    id: string;
    name: string | null;
    email: string;
  };
  entries: ApprovalEntry[];
  computed: {
    days: ApprovalComputedDay[];
    totals: {
      workedHours: number;
      breakHours: number;
      paidHours: number;
      regularHours: number;
      otMonFriHours: number;
      otSatHours: number;
      otSunBhHours: number;
      overtimeTotal: number;
      overnightCount: number;
      businessTopUpHours: number;
    };
  };
};

type Props = {
  initialWeeks: ApprovalWeek[];
};

type ActingState = {
  weekId: string;
  action: "APPROVE" | "REJECT" | "REOPEN" | "SUBMIT_CUTOFF";
} | null;

const DAY_NAMES = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

function dateKey(value: string) {
  return value.slice(0, 10);
}

function parseLocalDate(value: string) {
  const [year, month, day] = dateKey(value).split("-").map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

function formatInputDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfWeekMonday(dateInput: Date) {
  const date = new Date(dateInput);
  const day = date.getDay();
  const difference = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + difference);
  date.setHours(12, 0, 0, 0);
  return date;
}

function addDays(dateInput: Date, days: number) {
  const date = new Date(dateInput);
  date.setDate(date.getDate() + days);
  return date;
}

function addWeeks(value: string, amount: number) {
  const date = parseLocalDate(value);
  date.setDate(date.getDate() + amount * 7);
  return formatInputDate(startOfWeekMonday(date));
}

function formatDate(value: string) {
  return parseLocalDate(value).toLocaleDateString("en-GB");
}

function formatShortDate(value: string) {
  return parseLocalDate(value).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
  });
}

function fmt2(value: number | null | undefined) {
  const numberValue = Number(value || 0);
  return Number.isFinite(numberValue) ? numberValue.toFixed(2) : "0.00";
}

function employeeName(week: ApprovalWeek) {
  return week.user.name?.trim() || week.user.email;
}

function displayType(type: string) {
  switch (type.toUpperCase()) {
    case "WORK":
      return "Work";
    case "TRAINING":
      return "Training";
    case "HOLIDAY_FULL":
      return "Holiday";
    case "HOLIDAY_HALF":
      return "Half-day holiday";
    case "SICK":
      return "Sick";
    default:
      return type.replaceAll("_", " ");
  }
}

function getEntryLabel(entry: ApprovalEntry) {
  return entry.job?.trim() || entry.description?.trim() || displayType(entry.type);
}

function rowKey(weekId: string, dayIso: string) {
  return `${weekId}:${dayIso}`;
}

function StatusBadge({ status }: { status: string }) {
  const normalised = status.toUpperCase();

  const className =
    normalised === "SUBMITTED"
      ? "bg-blue-50 text-blue-800 ring-blue-200"
      : normalised === "APPROVED"
        ? "bg-emerald-50 text-emerald-800 ring-emerald-200"
        : normalised === "REJECTED"
          ? "bg-red-50 text-red-800 ring-red-200"
          : "bg-amber-50 text-amber-800 ring-amber-200";

  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${className}`}
    >
      {normalised}
    </span>
  );
}

function EntryTypeBadge({ type }: { type: string }) {
  const normalised = type.toUpperCase();

  const className =
    normalised === "WORK"
      ? "bg-cyan-50 text-cyan-800 ring-cyan-200"
      : normalised === "TRAINING"
        ? "bg-amber-50 text-amber-800 ring-amber-200"
        : normalised.startsWith("HOLIDAY")
          ? "bg-purple-50 text-purple-800 ring-purple-200"
          : normalised === "SICK"
            ? "bg-red-50 text-red-800 ring-red-200"
            : "bg-slate-50 text-slate-700 ring-slate-200";

  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${className}`}
    >
      {displayType(type).toUpperCase()}
    </span>
  );
}

async function readJsonOrText(response: Response) {
  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    return response.json();
  }

  return { error: (await response.text()).slice(0, 1200) };
}

export default function AdminApprovalsPageClient({ initialWeeks }: Props) {
  const currentMonday = formatInputDate(startOfWeekMonday(new Date()));

  const availableWeekStarts = useMemo(
    () =>
      Array.from(
        new Set(initialWeeks.map((week) => dateKey(week.weekStart))),
      ).sort((a, b) => b.localeCompare(a)),
    [initialWeeks],
  );

  const [weeks, setWeeks] = useState(initialWeeks);
  const [selectedWeekStart, setSelectedWeekStart] = useState(
    availableWeekStarts.includes(currentMonday)
      ? currentMonday
      : availableWeekStarts[0] || currentMonday,
  );
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const reviewedRows = useMemo(() => new Set(weeks.flatMap((week) =>
    week.dayApprovals.filter((day) => day.status === "APPROVED").map((day) => rowKey(week.id, dateKey(day.date))),
  )), [weeks]);
  const [actingDay, setActingDay] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [acting, setActing] = useState<ActingState>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedMonday = useMemo(
    () => parseLocalDate(selectedWeekStart),
    [selectedWeekStart],
  );

  const days = useMemo(
    () =>
      DAY_NAMES.map((name, index) => {
        const date = addDays(selectedMonday, index);
        return { name, iso: formatInputDate(date) };
      }),
    [selectedMonday],
  );

  const visibleWeeks = useMemo(
    () =>
      weeks
        .filter((week) => dateKey(week.weekStart) === selectedWeekStart)
        .filter(
          (week) => statusFilter === "ALL" || (statusFilter === "AWAITING_REVIEW"
            ? week.status === "SUBMITTED" || week.dayApprovals.some((day) => day.status === "PENDING") : week.status === statusFilter),
        )
        .sort((a, b) => employeeName(a).localeCompare(employeeName(b))),
    [weeks, selectedWeekStart, statusFilter],
  );

  const submittedWeeks = visibleWeeks.filter(
    (week) => week.status === "SUBMITTED" || week.dayApprovals.some((day) => day.status === "PENDING"),
  );

  const reviewableRows = useMemo(() => {
    const keys: string[] = [];

    for (const week of submittedWeeks) {
      for (const day of days) {
        const hasEntry = week.computed.days.some((item) => item.date === day.iso);

        if (hasEntry && (week.status === "SUBMITTED" || week.dayApprovals.some((item) => dateKey(item.date) === day.iso && (item.status === "PENDING" || item.status === "APPROVED")))) {
          keys.push(rowKey(week.id, day.iso));
        }
      }
    }

    return keys;
  }, [submittedWeeks, days]);

  const reviewedCount = reviewableRows.filter((key) =>
    reviewedRows.has(key),
  ).length;

  const totals = useMemo(
    () =>
      visibleWeeks.reduce(
        (acc, week) => {
          acc.paid += Number(week.computed.totals.paidHours || 0);
          acc.overtime += Number(week.computed.totals.overtimeTotal || 0);
          acc.overnights += Number(week.computed.totals.overnightCount || 0);
          return acc;
        },
        { paid: 0, overtime: 0, overnights: 0 },
      ),
    [visibleWeeks],
  );

  function toggleExpandedRow(key: string) {
    setExpandedRows((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function reviewPersonDay(week: ApprovalWeek, date: string, action: "APPROVE" | "REJECT" | "REOPEN") {
    const reason = action === "APPROVE" ? "" : window.prompt(`Reason to ${action.toLowerCase()} ${employeeName(week)}'s day (${formatDate(date)})? If already exported, notify Accounts and replace the download.`);
    if (reason === null) return;
    if (action !== "APPROVE" && !reason?.trim()) { setError("A reason is required."); return; }
    setActingDay(rowKey(week.id, date)); setError(null);
    try {
      const response = await fetch("/api/day/review", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ weekId: week.id, date, action, comment: reason }) });
      const data = await readJsonOrText(response);
      if (!response.ok) throw new Error(data.error || "Could not review day");
      setWeeks((current) => current.map((item) => item.id === week.id ? { ...item, status: data.week.status, dayApprovals: data.week.dayApprovals } : item));
    } catch (error) { setError(error instanceof Error ? error.message : "Could not review day"); }
    finally { setActingDay(null); }
  }

  async function submitCutoff(week: ApprovalWeek, through: string) {
    if (!window.confirm(`Submit ${employeeName(week)}'s days through ${formatDate(through)} for payroll review? Later days will stay open.`)) return;
    setActing({ weekId: week.id, action: "SUBMIT_CUTOFF" }); setError(null);
    try {
      const response = await fetch("/api/week/submit", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ weekId: week.id, through }) });
      const data = await readJsonOrText(response);
      if (!response.ok) throw new Error(data.error || "Could not submit payroll days");
      setWeeks((current) => current.map((item) => item.id === week.id ? { ...item, status: data.week.status, dayApprovals: data.week.dayApprovals } : item));
    } catch (error) { setError(error instanceof Error ? error.message : "Could not submit payroll days"); }
    finally { setActing(null); }
  }

  async function reviewWeek(
    weekId: string,
    action: "APPROVE" | "REJECT" | "REOPEN",
    reviewComment?: string | null,
  ) {
    setError(null);
    setActing({ weekId, action });

    try {
      const response = await fetch("/api/week/review", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          weekId,
          action,
          comment: reviewComment?.trim() || null,
        }),
      });

      const data = await readJsonOrText(response);

      if (!response.ok) {
        throw new Error(
          (data as { error?: string }).error || "Failed to review week",
        );
      }

      setWeeks((current) =>
        current.map((week) =>
          week.id === weekId
            ? {
                ...week,
                status: action === "APPROVE" ? "APPROVED" : "DRAFT",
                dayApprovals: data.week.dayApprovals,
              }
            : week,
        ),
      );

      return true;
    } catch (reviewError) {
      setError(
        reviewError instanceof Error
          ? reviewError.message
          : "Failed to review week",
      );
      return false;
    } finally {
      setActing(null);
    }
  }

  async function rejectWeek(week: ApprovalWeek) {
    const rejectionComment = window.prompt(
      `Why is ${employeeName(week)}'s timesheet being rejected?`,
      comment,
    );

    if (rejectionComment === null) return;

    if (!rejectionComment.trim()) {
      setError("A rejection comment is required.");
      return;
    }

    const successful = await reviewWeek(
      week.id,
      "REJECT",
      rejectionComment,
    );

    if (successful) {
      setComment("");
    }
  }

  async function reopenWeek(week: ApprovalWeek) {
    const reopenComment = window.prompt(
      `Why is ${employeeName(week)}'s approved timesheet being reopened?`,
      comment,
    );

    if (reopenComment === null) return;

    if (!reopenComment.trim()) {
      setError("A reason is required when reopening an approved week.");
      return;
    }

    const confirmed = window.confirm(
      `Reopen ${employeeName(week)}'s week commencing ${formatDate(week.weekStart)}?\n\nALL day approvals will be removed. If already exported, notify Accounts and replace the payroll download. To correct just one day, use Reopen day instead.`,
    );

    if (!confirmed) return;

    const successful = await reviewWeek(
      week.id,
      "REOPEN",
      reopenComment,
    );

    if (successful) {
      setComment("");
    }
  }

  async function approveWeek(week: ApprovalWeek) {
    const confirmed = window.confirm(
      `Approve ${employeeName(week)}'s week commencing ${formatDate(week.weekStart)}?`,
    );
    if (!confirmed) return;

    const successful = await reviewWeek(week.id, "APPROVE", comment);
    if (successful) {
      setComment("");
    }
  }

  return (
    <main className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            Weekly Approvals
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Day approvals are saved and immediately available to Accounts. Payroll runs
            from the 16th to the 15th. Approve the full week once the remaining days are submitted.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/timesheets"
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50"
          >
            Detailed Timesheets
          </Link>

        </div>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      <section className="grid gap-4 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200 lg:grid-cols-[1fr_1fr_1fr_1.2fr]">
        <div>
          <label className="block text-xs font-semibold text-slate-600">
            Week commencing Monday
          </label>
          <div className="mt-1 flex gap-2">
            <button
              type="button"
              onClick={() =>
                setSelectedWeekStart((current) => addWeeks(current, -1))
              }
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50"
            >
              ←
            </button>

            <input
              type="date"
              value={selectedWeekStart}
              onChange={(event) =>
                setSelectedWeekStart(
                  formatInputDate(
                    startOfWeekMonday(parseLocalDate(event.target.value)),
                  ),
                )
              }
              className="min-w-0 flex-1 rounded-xl bg-white px-3 py-2 text-sm ring-1 ring-slate-200 outline-none focus:ring-2 focus:ring-cyan-300"
            />

            <button
              type="button"
              onClick={() =>
                setSelectedWeekStart((current) => addWeeks(current, 1))
              }
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50"
            >
              →
            </button>
          </div>
        </div>

        <label>
          <span className="block text-xs font-semibold text-slate-600">
            Status
          </span>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="mt-1 w-full rounded-xl bg-white px-3 py-2 text-sm ring-1 ring-slate-200 outline-none focus:ring-2 focus:ring-cyan-300"
          >
            <option value="ALL">All statuses</option>
            <option value="AWAITING_REVIEW">Awaiting review (including part weeks)</option>
            <option value="SUBMITTED">Submitted</option>
            <option value="APPROVED">Approved</option>
            <option value="DRAFT">Draft</option>
            <option value="REJECTED">Rejected</option>
          </select>
        </label>

        <label>
          <span className="block text-xs font-semibold text-slate-600">
            Approval comment
          </span>
          <input
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            placeholder="Optional for approvals"
            className="mt-1 w-full rounded-xl bg-white px-3 py-2 text-sm ring-1 ring-slate-200 outline-none focus:ring-2 focus:ring-cyan-300"
          />
        </label>

        <div className="grid grid-cols-3 gap-2">
          <SummaryPill label="Employees" value={visibleWeeks.length} />
          <SummaryPill label="Paid" value={fmt2(totals.paid)} />
          <SummaryPill
            label="Approved"
            value={`${reviewedCount}/${reviewableRows.length}`}
          />
        </div>
      </section>

      {visibleWeeks.length === 0 ? (
        <section className="rounded-3xl bg-white p-8 text-center text-sm text-slate-600 shadow-sm ring-1 ring-slate-200">
          No timesheets were found for the selected week and status.
        </section>
      ) : (
        <div className="space-y-6">
          {days.map((day) => {
            const dayRows = visibleWeeks.map((week) => {
              const entries = week.entries.filter(
                (entry) => dateKey(entry.date) === day.iso,
              );
              const computedDay = week.computed.days.find(
                (item) => item.date === day.iso,
              );
              return { week, entries, computedDay };
            });

            const reviewableDayKeys = dayRows
              .filter(
                ({ week, computedDay }) => Boolean(computedDay) && (week.status === "SUBMITTED" || week.dayApprovals.some((item) => dateKey(item.date) === day.iso && (item.status === "PENDING" || item.status === "APPROVED"))),
              )
              .map(({ week }) => rowKey(week.id, day.iso));

            const reviewedDayCount = reviewableDayKeys.filter((key) =>
              reviewedRows.has(key),
            ).length;
            return (
              <section
                key={day.iso}
                className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-slate-200"
              >
                <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 px-5 py-4">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">
                      {day.name}
                    </h2>
                    <div className="text-xs text-slate-500">
                      {formatShortDate(day.iso)}
                    </div>
                  </div>

                  <div className="text-xs font-semibold text-slate-600">
                    Approved {reviewedDayCount}/{reviewableDayKeys.length}
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1000px] text-sm">
                    <thead>
                      <tr className="border-t border-slate-200 bg-white text-left text-xs font-semibold text-slate-600">
                        <th className="px-4 py-3">Day approval</th>
                        <th className="px-4 py-3">Employee</th>
                        <th className="px-4 py-3">Start</th>
                        <th className="px-4 py-3">Finish</th>
                        <th className="px-4 py-3">Paid</th>
                        <th className="px-4 py-3">OT</th>
                        <th className="px-4 py-3">Jobs / Sites</th>
                        <th className="px-4 py-3">Overnight</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3 text-right">Actions</th>
                      </tr>
                    </thead>

                    <tbody>
                      {dayRows.map(({ week, entries, computedDay }) => {
                        const key = rowKey(week.id, day.iso);
                        const expanded = expandedRows.has(key);
                        const dayApproval = week.dayApprovals.find((item) => dateKey(item.date) === day.iso);
                        const reviewed = week.status === "APPROVED" || reviewedRows.has(key);
                        const canApproveDay =
                          !reviewed && (week.status === "SUBMITTED" || dayApproval?.status === "PENDING") && Boolean(computedDay);

                        const starts = entries
                          .map((entry) => entry.startTime)
                          .filter(Boolean);
                        const finishes = entries
                          .map((entry) => entry.finishTime)
                          .filter(Boolean);

                        const overtime =
                          Number(computedDay?.otMonFriHours || 0) +
                          Number(computedDay?.otSatHours || 0) +
                          Number(computedDay?.otSunBhHours || 0);

                        const jobs = [
                          ...new Set(
                            entries.map(getEntryLabel).filter(Boolean),
                          ),
                        ];

                        const hasLongShift =
                          Number(computedDay?.workedHours || 0) > 12;

                        const missingTime = entries.some(
                          (entry) =>
                            entry.type === "WORK" &&
                            (!entry.startTime || !entry.finishTime),
                        );

                        const rowBackground = reviewed
                          ? "bg-emerald-50/60"
                          : missingTime
                            ? "bg-red-50/60"
                            : hasLongShift
                              ? "bg-amber-50/60"
                              : "";

                        return (
                          <Fragment key={key}>
                            <tr
                              key={key}
                              className={`border-t border-slate-200 align-top ${rowBackground}`}
                            >
                              <td className="px-4 py-4">
                                {reviewed ? (
                                  <div className="space-y-2"><span className="font-semibold text-emerald-700">Approved ✓</span>
                                    <button type="button" disabled={Boolean(actingDay) || Boolean(acting)} onClick={() => reviewPersonDay(week, day.iso, "REOPEN")} className="block text-xs text-amber-800 underline">Reopen day</button>
                                  </div>
                                ) : canApproveDay ? (
                                  <div className="space-y-2">
                                  <button
                                    type="button"
                                    onClick={() => reviewPersonDay(week, day.iso, "APPROVE")}
                                    disabled={Boolean(actingDay) || Boolean(acting)}
                                    className={`min-w-[112px] rounded-lg px-3 py-2 text-xs font-bold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-100 ${
                                      reviewed
                                        ? "bg-emerald-700"
                                        : "bg-emerald-500 hover:bg-emerald-400"
                                    }`}
                                  >
                                    {actingDay === key ? "Saving…" : "Approve Day"}
                                  </button>
                                  <button type="button" disabled={Boolean(actingDay) || Boolean(acting)} onClick={() => reviewPersonDay(week, day.iso, "REJECT")} className="block text-xs text-red-700 underline">Reject day</button>
                                  </div>
                                ) : (
                                  <span className="text-xs text-slate-500">{dayApproval?.status === "REJECTED" ? "Returned for correction" : "Not submitted"}</span>
                                )}
                              </td>

                              <td className="px-4 py-4">
                                <div className="font-semibold text-slate-900">
                                  {employeeName(week)}
                                </div>
                                {hasLongShift ? (
                                  <div className="mt-1 text-[11px] font-semibold text-amber-700">
                                    Long shift
                                  </div>
                                ) : null}
                                {missingTime ? (
                                  <div className="mt-1 text-[11px] font-semibold text-red-700">
                                    Missing time
                                  </div>
                                ) : null}
                              </td>

                              <td className="px-4 py-4 font-medium">
                                {starts[0] || "—"}
                              </td>
                              <td className="px-4 py-4 font-medium">
                                {finishes.at(-1) || "—"}
                              </td>
                              <td className="px-4 py-4 font-semibold">
                                {fmt2(computedDay?.paidHours)}
                              </td>
                              <td className="px-4 py-4">
                                {overtime > 0 ? fmt2(overtime) : "—"}
                              </td>

                              <td className="max-w-[360px] px-4 py-4">
                                {jobs.length > 0 ? (
                                  <div className="space-y-1">
                                    {jobs.map((job) => (
                                      <div key={job}>{job}</div>
                                    ))}
                                  </div>
                                ) : (
                                  <span className="text-slate-400">
                                    No entry
                                  </span>
                                )}
                              </td>

                              <td className="px-4 py-4">
                                {computedDay?.overnightCount
                                  ? `Yes (${computedDay.overnightCount})`
                                  : "—"}
                              </td>

                              <td className="px-4 py-4">
                                <StatusBadge status={week.status} />
                              </td>

                              <td className="px-4 py-4">
                                <div className="flex justify-end gap-2">
                                  {entries.length > 0 ? (
                                    <button
                                      type="button"
                                      onClick={() => toggleExpandedRow(key)}
                                      className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold hover:bg-slate-50"
                                    >
                                      {expanded ? "Hide" : "Details"}
                                    </button>
                                  ) : null}
                                </div>
                              </td>
                            </tr>

                            {expanded ? (
                              <tr
                                key={`${key}:detail`}
                                className="border-t border-slate-100 bg-slate-50"
                              >
                                <td colSpan={10} className="px-5 py-4">
                                  <div className="grid gap-3 lg:grid-cols-2">
                                    {entries.map((entry) => {
                                      const entryOvertime =
                                        Number(entry.otMonFriHours || 0) +
                                        Number(entry.otSatHours || 0) +
                                        Number(entry.otSunBhHours || 0);

                                      return (
                                        <div
                                          key={entry.id}
                                          className="rounded-2xl bg-white p-4 ring-1 ring-slate-200"
                                        >
                                          <div className="flex items-start justify-between gap-3">
                                            <div>
                                              <EntryTypeBadge type={entry.type} />
                                              <div className="mt-2 font-semibold text-slate-900">
                                                {getEntryLabel(entry)}
                                              </div>
                                              <div className="mt-1 text-xs text-slate-600">
                                                {entry.startTime || "—"}–
                                                {entry.finishTime || "—"}
                                              </div>
                                              {entry.description ? (
                                                <div className="mt-2 text-xs text-slate-600">
                                                  {entry.description}
                                                </div>
                                              ) : null}
                                            </div>

                                            <div className="text-right">
                                              <div className="font-semibold text-slate-900">
                                                {fmt2(entry.hours)}h
                                              </div>
                                              <div className="mt-1 text-[11px] text-slate-500">
                                                Regular{" "}
                                                {fmt2(entry.regularHours)}
                                                {entryOvertime > 0
                                                  ? ` • OT ${fmt2(entryOvertime)}`
                                                  : ""}
                                              </div>
                                              {entry.overnight ? (
                                                <div className="mt-1 text-[11px] font-semibold text-emerald-700">
                                                  Overnight
                                                </div>
                                              ) : null}

                                              {!reviewed && dayApproval?.status !== "PENDING" ? <Link
                                                href={`/timesheet/entry/${encodeURIComponent(
                                                  entry.id,
                                                )}?admin=1&adminWeekId=${encodeURIComponent(
                                                  week.id,
                                                )}`}
                                                className="mt-3 inline-flex rounded-lg bg-cyan-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-cyan-500"
                                              >
                                                Edit
                                              </Link> : null}
                                            </div>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </td>
                              </tr>
                            ) : null}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })}
        </div>
      )}

      {visibleWeeks.length > 0 ? (
        <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">
            Employee Week Totals
          </h2>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="bg-slate-50 text-left text-xs font-semibold text-slate-600">
                  <th className="px-4 py-3">Employee</th>
                  <th className="px-4 py-3">Regular</th>
                  <th className="px-4 py-3">OT Mon–Fri</th>
                  <th className="px-4 py-3">OT Sat</th>
                  <th className="px-4 py-3">OT Sun/BH</th>
                  <th className="px-4 py-3">Top-up</th>
                  <th className="px-4 py-3">Paid</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>

              <tbody>
                {visibleWeeks.map((week) => {
                  const weekDayKeys = days
                    .filter((day) => week.computed.days.some((item) => item.date === day.iso))
                    .map((day) => rowKey(week.id, day.iso));
                  const approvedDayCount = weekDayKeys.filter((key) =>
                    reviewedRows.has(key),
                  ).length;
                  const allWeekDaysApproved =
                    weekDayKeys.length > 0 &&
                    approvedDayCount === weekDayKeys.length;
                  const cutoff = days.find((day) => day.iso.endsWith("-15"))?.iso;
                  const canSubmitCutoff = cutoff && week.computed.days.some((day) => day.date <= cutoff && !week.dayApprovals.some((item) => dateKey(item.date) === day.date && (item.status === "APPROVED" || item.status === "PENDING")));

                  return (
                    <tr key={week.id} className="border-t border-slate-200">
                      <td className="px-4 py-3">
                        <div className="font-semibold">
                          {employeeName(week)}
                        </div>
                        {week.status !== "APPROVED" ? (
                          <div className="mt-1 text-[11px] text-slate-500">
                            {approvedDayCount} of {weekDayKeys.length} days approved
                          </div>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">
                        {fmt2(week.computed.totals.regularHours)}
                      </td>
                      <td className="px-4 py-3">
                        {fmt2(week.computed.totals.otMonFriHours)}
                      </td>
                      <td className="px-4 py-3">
                        {fmt2(week.computed.totals.otSatHours)}
                      </td>
                      <td className="px-4 py-3">
                        {fmt2(week.computed.totals.otSunBhHours)}
                      </td>
                      <td className="px-4 py-3">
                        {fmt2(week.computed.totals.businessTopUpHours)}
                      </td>
                      <td className="px-4 py-3 font-semibold">
                        {fmt2(week.computed.totals.paidHours)}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={week.status} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap justify-end gap-2">
                          {week.status === "SUBMITTED" ? (
                            <>
                              <button
                                type="button"
                                onClick={() => rejectWeek(week)}
                                disabled={Boolean(acting)}
                                className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                              >
                                {acting?.weekId === week.id &&
                                acting.action === "REJECT"
                                  ? "Rejecting…"
                                  : "Reject Week"}
                              </button>
                              <button
                                type="button"
                                onClick={() => approveWeek(week)}
                                disabled={
                                  !allWeekDaysApproved || Boolean(acting) || Boolean(actingDay)
                                }
                                className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                {acting?.weekId === week.id &&
                                acting.action === "APPROVE"
                                  ? "Approving…"
                                  : "Approve Week"}
                              </button>
                            </>
                          ) : week.status === "APPROVED" ? (
                            <button
                              type="button"
                              onClick={() => reopenWeek(week)}
                              disabled={Boolean(acting)}
                              className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-50"
                            >
                              {acting?.weekId === week.id &&
                              acting.action === "REOPEN"
                                ? "Reopening…"
                                : "Reopen Week"}
                            </button>
                          ) : (
                            cutoff && canSubmitCutoff ? <button type="button" onClick={() => submitCutoff(week, cutoff)} disabled={Boolean(acting) || Boolean(actingDay)} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Submit up to 15th</button> : <span className="text-slate-400">—</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

    </main>
  );
}

function SummaryPill({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-2xl bg-slate-50 px-3 py-3 ring-1 ring-slate-200">
      <div className="text-[11px] font-semibold text-slate-500">
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold text-slate-900">
        {value}
      </div>
    </div>
  );
}
