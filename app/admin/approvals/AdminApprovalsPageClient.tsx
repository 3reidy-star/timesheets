"use client";

import Link from "next/link";
import { Fragment, useEffect, useMemo, useState } from "react";

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
  action: "APPROVE" | "REJECT";
} | null;

const REVIEWED_STORAGE_KEY = "admin-approvals-reviewed-entry-ids";

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

function addWeeks(value: string, amount: number) {
  const date = parseLocalDate(value);
  date.setDate(date.getDate() + amount * 7);
  return formatInputDate(startOfWeekMonday(date));
}

function formatDate(value: string) {
  return parseLocalDate(value).toLocaleDateString("en-GB");
}

function formatDay(value: string) {
  return parseLocalDate(value).toLocaleDateString("en-GB", {
    weekday: "long",
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

function comparisonKey(entry: ApprovalEntry) {
  if (entry.type.toUpperCase() !== "WORK") {
    return `other:${entry.type.toUpperCase()}:${getEntryLabel(entry).toLocaleLowerCase()}`;
  }

  return `work:${getEntryLabel(entry).replace(/\s+/g, " ").trim().toLocaleLowerCase()}`;
}

function timeSignature(entry: ApprovalEntry) {
  return `${entry.startTime || "—"}|${entry.finishTime || "—"}|${fmt2(entry.hours)}`;
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
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${className}`}>
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
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${className}`}>
      {displayType(type).toUpperCase()}
    </span>
  );
}

function SummaryPill({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl bg-slate-50 px-3 py-3 ring-1 ring-slate-200">
      <div className="text-[11px] font-semibold text-slate-500">{label}</div>
      <div className="mt-1 text-lg font-semibold text-slate-900">{value}</div>
    </div>
  );
}

async function readJsonOrText(response: Response) {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) return response.json();
  return { error: (await response.text()).slice(0, 1200) };
}

function safeReadReviewedEntries() {
  if (typeof window === "undefined") return new Set<string>();

  try {
    const raw = window.sessionStorage.getItem(REVIEWED_STORAGE_KEY);
    if (!raw) return new Set<string>();
    const values = JSON.parse(raw);
    return new Set(Array.isArray(values) ? values.filter((value) => typeof value === "string") : []);
  } catch {
    return new Set<string>();
  }
}

export default function AdminApprovalsPageClient({ initialWeeks }: Props) {
  const currentMonday = formatInputDate(startOfWeekMonday(new Date()));
  const availableWeekStarts = useMemo(
    () => Array.from(new Set(initialWeeks.map((week) => dateKey(week.weekStart)))).sort((a, b) => b.localeCompare(a)),
    [initialWeeks],
  );

  const [weeks, setWeeks] = useState(initialWeeks);
  const [selectedWeekStart, setSelectedWeekStart] = useState(
    availableWeekStarts.includes(currentMonday) ? currentMonday : availableWeekStarts[0] || currentMonday,
  );
  const [statusFilter, setStatusFilter] = useState("SUBMITTED");
  const [comment, setComment] = useState("");
  const [acting, setActing] = useState<ActingState>(null);
  const [error, setError] = useState<string | null>(null);
  const [reviewedEntries, setReviewedEntries] = useState<Set<string>>(new Set());
  const [storageLoaded, setStorageLoaded] = useState(false);
  const [expandedEntries, setExpandedEntries] = useState<Set<string>>(new Set());

  useEffect(() => {
    setReviewedEntries(safeReadReviewedEntries());
    setStorageLoaded(true);
  }, []);

  useEffect(() => {
    if (!storageLoaded || typeof window === "undefined") return;
    window.sessionStorage.setItem(REVIEWED_STORAGE_KEY, JSON.stringify(Array.from(reviewedEntries)));
  }, [reviewedEntries, storageLoaded]);

  const visibleWeeks = useMemo(
    () =>
      weeks
        .filter((week) => dateKey(week.weekStart) === selectedWeekStart)
        .filter((week) => statusFilter === "ALL" || week.status === statusFilter)
        .sort((a, b) => employeeName(a).localeCompare(employeeName(b))),
    [weeks, selectedWeekStart, statusFilter],
  );

  const reviewDays = useMemo(() => {
    const dayMap = new Map<
      string,
      Array<{ week: ApprovalWeek; entry: ApprovalEntry; employee: string }>
    >();

    for (const week of visibleWeeks) {
      for (const entry of week.entries) {
        const dayIso = dateKey(entry.date);
        dayMap.set(dayIso, [
          ...(dayMap.get(dayIso) ?? []),
          { week, entry, employee: employeeName(week) },
        ]);
      }
    }

    return Array.from(dayMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([dayIso, rows]) => {
        const jobMap = new Map<string, typeof rows>();

        for (const row of rows) {
          const key = comparisonKey(row.entry);
          jobMap.set(key, [...(jobMap.get(key) ?? []), row]);
        }

        const comparisonByEntry = new Map<string, "MATCH" | "DIFF" | "SINGLE">();
        let mismatchCount = 0;

        for (const jobRows of jobMap.values()) {
          const employeeCount = new Set(jobRows.map((row) => row.week.user.id)).size;
          const comparable =
            employeeCount > 1 &&
            jobRows.every((row) => row.entry.type.toUpperCase() === "WORK");
          const mismatch =
            comparable && new Set(jobRows.map((row) => timeSignature(row.entry))).size > 1;

          if (mismatch) mismatchCount += 1;
          for (const row of jobRows) {
            comparisonByEntry.set(
              row.entry.id,
              comparable ? (mismatch ? "DIFF" : "MATCH") : "SINGLE",
            );
          }
        }

        const sortedRows = rows.slice().sort((a, b) => {
          const jobCompare = getEntryLabel(a.entry).localeCompare(getEntryLabel(b.entry));
          if (jobCompare !== 0) return jobCompare;
          const employeeCompare = a.employee.localeCompare(b.employee);
          if (employeeCompare !== 0) return employeeCompare;
          return (a.entry.startTime || "").localeCompare(b.entry.startTime || "");
        });

        const staffCount = new Set(rows.map((row) => row.week.user.id)).size;
        const reviewedCount = rows.filter((row) => reviewedEntries.has(row.entry.id)).length;
        const paidHours = Array.from(
          new Map(rows.map((row) => [row.week.id, row.week])).values(),
        ).reduce((sum, week) => {
          const computedDay = week.computed.days.find((day) => day.date === dayIso);
          return sum + Number(computedDay?.paidHours || 0);
        }, 0);

        return {
          dayIso,
          rows: sortedRows.map((row) => ({
            ...row,
            comparison: comparisonByEntry.get(row.entry.id) ?? "SINGLE",
          })),
          jobCount: jobMap.size,
          staffCount,
          reviewedCount,
          paidHours,
          mismatchCount,
        };
      });
  }, [reviewedEntries, visibleWeeks]);

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

  const daysWithDifferences = reviewDays.filter((day) => day.mismatchCount > 0).length;

  function toggleEntryReview(entryId: string) {
    setReviewedEntries((current) => {
      const next = new Set(current);
      if (next.has(entryId)) next.delete(entryId);
      else next.add(entryId);
      return next;
    });
  }

  function toggleEntryDetails(entryId: string) {
    setExpandedEntries((current) => {
      const next = new Set(current);
      if (next.has(entryId)) next.delete(entryId);
      else next.add(entryId);
      return next;
    });
  }

  function approveAllEntriesForWeek(week: ApprovalWeek) {
    setReviewedEntries((current) => {
      const next = new Set(current);
      for (const entry of week.entries) next.add(entry.id);
      return next;
    });
  }

  function clearEntriesForWeek(week: ApprovalWeek) {
    setReviewedEntries((current) => {
      const next = new Set(current);
      for (const entry of week.entries) next.delete(entry.id);
      return next;
    });
  }

  async function reviewWeek(week: ApprovalWeek, action: "APPROVE" | "REJECT", reviewComment?: string | null) {
    setError(null);
    setActing({ weekId: week.id, action });

    try {
      const response = await fetch("/api/week/review", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          weekId: week.id,
          action,
          comment: reviewComment?.trim() || null,
        }),
      });

      const data = await readJsonOrText(response);
      if (!response.ok) {
        throw new Error((data as { error?: string }).error || "Failed to review week");
      }

      setWeeks((current) =>
        current.map((item) =>
          item.id === week.id ? { ...item, status: action === "APPROVE" ? "APPROVED" : "DRAFT" } : item,
        ),
      );

      clearEntriesForWeek(week);
      setComment("");
      return true;
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : "Failed to review week");
      return false;
    } finally {
      setActing(null);
    }
  }

  async function approveWeek(week: ApprovalWeek) {
    const reviewedCount = week.entries.filter((entry) => reviewedEntries.has(entry.id)).length;
    const allReviewed = week.entries.length > 0 && reviewedCount === week.entries.length;

    if (!allReviewed) {
      setError(`Approve all ${week.entries.length} line${week.entries.length === 1 ? "" : "s"} for ${employeeName(week)} before approving the week.`);
      return;
    }

    const confirmed = window.confirm(
      `Approve ${employeeName(week)}'s week commencing ${formatDate(week.weekStart)}?`,
    );
    if (!confirmed) return;

    await reviewWeek(week, "APPROVE", comment);
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

    await reviewWeek(week, "REJECT", rejectionComment);
  }

  return (
    <main className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Daily Approvals</h1>
          <p className="mt-1 text-sm text-slate-600">
            Compare everyone on the same job, day by day, then approve each completed employee week.
          </p>
        </div>

        <Link
          href="/admin/timesheets"
          className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50"
        >
          Detailed Timesheets
        </Link>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      <section className="grid gap-4 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200 lg:grid-cols-[1.2fr_1fr_1.3fr]">
        <div>
          <label className="block text-xs font-semibold text-slate-600">Week commencing Monday</label>
          <div className="mt-1 flex gap-2">
            <button
              type="button"
              onClick={() => setSelectedWeekStart((current) => addWeeks(current, -1))}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50"
            >
              ←
            </button>
            <input
              type="date"
              value={selectedWeekStart}
              onChange={(event) =>
                setSelectedWeekStart(formatInputDate(startOfWeekMonday(parseLocalDate(event.target.value))))
              }
              className="min-w-0 flex-1 rounded-xl bg-white px-3 py-2 text-sm ring-1 ring-slate-200 outline-none focus:ring-2 focus:ring-cyan-300"
            />
            <button
              type="button"
              onClick={() => setSelectedWeekStart((current) => addWeeks(current, 1))}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50"
            >
              →
            </button>
          </div>
        </div>

        <label>
          <span className="block text-xs font-semibold text-slate-600">Status</span>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="mt-1 w-full rounded-xl bg-white px-3 py-2 text-sm ring-1 ring-slate-200 outline-none focus:ring-2 focus:ring-cyan-300"
          >
            <option value="SUBMITTED">Submitted</option>
            <option value="ALL">All statuses</option>
            <option value="APPROVED">Approved</option>
            <option value="DRAFT">Draft</option>
            <option value="REJECTED">Rejected</option>
          </select>
        </label>

        <label>
          <span className="block text-xs font-semibold text-slate-600">Approval comment</span>
          <input
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            placeholder="Optional for approvals"
            className="mt-1 w-full rounded-xl bg-white px-3 py-2 text-sm ring-1 ring-slate-200 outline-none focus:ring-2 focus:ring-cyan-300"
          />
        </label>
      </section>

      <section className="grid gap-3 sm:grid-cols-4">
        <SummaryPill label="Employees" value={visibleWeeks.length} />
        <SummaryPill label="Paid hours" value={fmt2(totals.paid)} />
        <SummaryPill label="Days to review" value={reviewDays.length} />
        <SummaryPill label="Days with differences" value={daysWithDifferences} />
      </section>

      {visibleWeeks.length === 0 ? (
        <section className="rounded-3xl bg-white p-8 text-center text-sm text-slate-600 shadow-sm ring-1 ring-slate-200">
          No timesheets were found for the selected week and status.
        </section>
      ) : (
        <div className="space-y-6">
          <section className="rounded-2xl border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm text-cyan-950">
            Each row shows the date, employee, job and the exact start and finish times entered.
            Rows are sorted by job so employees on the same job appear together.
          </section>

          {reviewDays.length === 0 ? (
            <section className="rounded-3xl bg-white p-8 text-center text-sm text-slate-600 shadow-sm ring-1 ring-slate-200">
              These employee weeks do not contain any entries.
            </section>
          ) : (
            reviewDays.map((day) => (
              <section
                key={day.dayIso}
                className={`overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ${
                  day.mismatchCount > 0 ? "ring-amber-300" : "ring-slate-200"
                }`}
              >
                <div className="flex flex-col gap-4 border-b border-slate-200 bg-slate-900 px-5 py-5 text-white lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-xl font-semibold">{formatDay(day.dayIso)}</h2>
                      {day.mismatchCount > 0 ? (
                        <span className="rounded-full bg-amber-300 px-2.5 py-1 text-xs font-bold text-amber-950">
                          {day.mismatchCount} job{day.mismatchCount === 1 ? "" : "s"} with different times
                        </span>
                      ) : (
                        <span className="rounded-full bg-emerald-400 px-2.5 py-1 text-xs font-bold text-emerald-950">
                          No differences found
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-slate-300">
                      {day.staffCount} {day.staffCount === 1 ? "person" : "people"} · {day.jobCount}{" "}
                      {day.jobCount === 1 ? "job / entry type" : "jobs / entry types"} · {fmt2(day.paidHours)} paid hours
                    </p>
                  </div>

                  <div className="text-sm font-semibold text-slate-200">
                    {day.reviewedCount} of {day.rows.length} lines reviewed
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-[1120px] w-full border-collapse text-left text-sm">
                    <thead className="bg-slate-100 text-xs font-semibold uppercase tracking-wide text-slate-600">
                      <tr>
                        <th className="px-4 py-3">Date</th>
                        <th className="px-4 py-3">Employee</th>
                        <th className="px-4 py-3">Job</th>
                        <th className="px-4 py-3">Start</th>
                        <th className="px-4 py-3">Finish</th>
                        <th className="px-4 py-3 text-right">Hours</th>
                        <th className="px-4 py-3">Review</th>
                        <th className="px-4 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {day.rows.map(({ week, entry, employee, comparison }) => {
                        const reviewed = reviewedEntries.has(entry.id);
                        const expanded = expandedEntries.has(entry.id);
                        const isSubmitted = week.status === "SUBMITTED";
                        const missingTime =
                          entry.type.toUpperCase() === "WORK" && (!entry.startTime || !entry.finishTime);
                        const returnTo = `/admin/approvals?weekStart=${encodeURIComponent(selectedWeekStart)}`;

                        return (
                          <Fragment key={entry.id}>
                            <tr
                              className={
                                reviewed
                                  ? "bg-emerald-50/70"
                                  : missingTime
                                    ? "bg-red-50/70"
                                    : comparison === "DIFF"
                                      ? "bg-amber-50/60"
                                      : "bg-white"
                              }
                            >
                              <td className="whitespace-nowrap px-4 py-4 font-semibold text-slate-900">
                                {formatDate(day.dayIso)}
                              </td>
                              <td className="px-4 py-4">
                                <div className="font-semibold text-slate-900">{employee}</div>
                                <div className="mt-1"><StatusBadge status={week.status} /></div>
                              </td>
                              <td className="px-4 py-4">
                                <div className="font-semibold text-slate-900">{getEntryLabel(entry)}</div>
                                <div className="mt-1 flex flex-wrap items-center gap-2">
                                  <EntryTypeBadge type={entry.type} />
                                  {comparison === "DIFF" ? (
                                    <span className="rounded-full bg-amber-200 px-2 py-0.5 text-[10px] font-bold text-amber-950 ring-1 ring-amber-300">
                                      Times differ
                                    </span>
                                  ) : comparison === "MATCH" ? (
                                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 ring-1 ring-emerald-200">
                                      Times match
                                    </span>
                                  ) : null}
                                </div>
                              </td>
                              <td className="whitespace-nowrap px-4 py-4 font-mono text-base font-semibold text-slate-900">
                                {entry.startTime || "—"}
                              </td>
                              <td className="whitespace-nowrap px-4 py-4 font-mono text-base font-semibold text-slate-900">
                                {entry.finishTime || "—"}
                              </td>
                              <td className="whitespace-nowrap px-4 py-4 text-right text-base font-semibold text-slate-900">
                                {fmt2(entry.hours)}h
                              </td>
                              <td className="px-4 py-4">
                                {isSubmitted ? (
                                  <button
                                    type="button"
                                    onClick={() => toggleEntryReview(entry.id)}
                                    className={`min-w-[110px] rounded-lg px-3 py-2 text-xs font-semibold ring-1 ${
                                      reviewed
                                        ? "bg-emerald-600 text-white ring-emerald-600 hover:bg-emerald-500"
                                        : "bg-white text-emerald-700 ring-emerald-300 hover:bg-emerald-50"
                                    }`}
                                  >
                                    {reviewed ? "Approved ✓" : "Approve line"}
                                  </button>
                                ) : (
                                  <StatusBadge status={week.status} />
                                )}
                              </td>
                              <td className="px-4 py-4">
                                <div className="flex justify-end gap-2">
                                  <button
                                    type="button"
                                    onClick={() => toggleEntryDetails(entry.id)}
                                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                                  >
                                    {expanded ? "Hide details" : "Details"}
                                  </button>
                                  <Link
                                    href={`/timesheet/entry/${encodeURIComponent(entry.id)}?admin=1&adminWeekId=${encodeURIComponent(week.id)}&returnTo=${encodeURIComponent(returnTo)}`}
                                    className="rounded-lg bg-cyan-600 px-3 py-2 text-xs font-semibold text-white hover:bg-cyan-500"
                                  >
                                    Edit
                                  </Link>
                                </div>
                              </td>
                            </tr>

                            {expanded ? (
                              <tr className="bg-slate-50">
                                <td colSpan={8} className="px-4 py-4">
                                  <div className="grid gap-3 sm:grid-cols-4">
                                    <SummaryPill label="Regular" value={fmt2(entry.regularHours)} />
                                    <SummaryPill label="OT Mon–Fri" value={fmt2(entry.otMonFriHours)} />
                                    <SummaryPill label="OT Saturday" value={fmt2(entry.otSatHours)} />
                                    <SummaryPill label="OT Sunday/BH" value={fmt2(entry.otSunBhHours)} />
                                    {entry.description ? (
                                      <div className="rounded-2xl bg-white px-4 py-3 text-sm text-slate-700 ring-1 ring-slate-200 sm:col-span-4">
                                        <span className="font-semibold">Notes:</span> {entry.description}
                                      </div>
                                    ) : null}
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
            ))
          )}

          <section className="overflow-hidden rounded-3xl bg-slate-900 text-white shadow-sm ring-1 ring-slate-800">
            <div className="border-b border-slate-700 px-5 py-5">
              <h2 className="text-xl font-semibold">Final weekly approval</h2>
              <p className="mt-1 text-sm text-slate-300">
                Once every line is reviewed above, approve each employee's week. Approved employees leave the submitted list automatically.
              </p>
            </div>

            <div className="divide-y divide-slate-700">
              {visibleWeeks.map((week) => {
                const reviewedCount = week.entries.filter((entry) => reviewedEntries.has(entry.id)).length;
                const allReviewed = week.entries.length > 0 && reviewedCount === week.entries.length;
                const isSubmitted = week.status === "SUBMITTED";

                return (
                  <div
                    key={week.id}
                    className={`grid gap-4 px-5 py-5 xl:grid-cols-[minmax(180px,1fr)_minmax(260px,1.4fr)_auto] xl:items-center ${
                      allReviewed && isSubmitted ? "bg-emerald-950/40" : ""
                    }`}
                  >
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold">{employeeName(week)}</h3>
                        <StatusBadge status={week.status} />
                      </div>
                      <div className="mt-1 text-xs text-slate-400">
                        {fmt2(week.computed.totals.paidHours)} paid · {fmt2(week.computed.totals.overtimeTotal)} overtime
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="font-semibold">
                          {reviewedCount} of {week.entries.length} lines reviewed
                        </span>
                        <span className={allReviewed ? "text-emerald-300" : "text-slate-400"}>
                          {allReviewed ? "Ready" : "Review outstanding"}
                        </span>
                      </div>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-700">
                        <div
                          className="h-full rounded-full bg-emerald-400 transition-all"
                          style={{
                            width: `${week.entries.length === 0 ? 0 : (reviewedCount / week.entries.length) * 100}%`,
                          }}
                        />
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 xl:justify-end">
                      {isSubmitted ? (
                        <>
                          <button
                            type="button"
                            onClick={() => approveAllEntriesForWeek(week)}
                            disabled={allReviewed || week.entries.length === 0}
                            className="rounded-xl border border-slate-600 bg-slate-800 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-40"
                          >
                            Approve all lines
                          </button>
                          <button
                            type="button"
                            onClick={() => clearEntriesForWeek(week)}
                            disabled={reviewedCount === 0}
                            className="rounded-xl border border-slate-600 bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700 disabled:opacity-40"
                          >
                            Clear
                          </button>
                          <button
                            type="button"
                            onClick={() => rejectWeek(week)}
                            disabled={Boolean(acting)}
                            className="rounded-xl border border-red-400/50 bg-red-950/40 px-3 py-2 text-xs font-semibold text-red-200 hover:bg-red-900/50 disabled:opacity-40"
                          >
                            {acting?.weekId === week.id && acting.action === "REJECT" ? "Rejecting…" : "Reject Week"}
                          </button>
                          <button
                            type="button"
                            onClick={() => approveWeek(week)}
                            disabled={!allReviewed || Boolean(acting)}
                            className="rounded-xl bg-emerald-500 px-4 py-2 text-xs font-bold text-emerald-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-35"
                          >
                            {acting?.weekId === week.id && acting.action === "APPROVE" ? "Approving…" : "Approve Week"}
                          </button>
                        </>
                      ) : (
                        <StatusBadge status={week.status} />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}