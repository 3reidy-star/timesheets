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
          <h1 className="text-2xl font-semibold text-slate-900">Weekly Approvals</h1>
          <p className="mt-1 text-sm text-slate-600">
            Review one employee at a time, approve each entry, then approve their completed week.
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
        <SummaryPill label="Overtime" value={fmt2(totals.overtime)} />
        <SummaryPill label="Overnights" value={totals.overnights} />
      </section>

      {visibleWeeks.length === 0 ? (
        <section className="rounded-3xl bg-white p-8 text-center text-sm text-slate-600 shadow-sm ring-1 ring-slate-200">
          No timesheets were found for the selected week and status.
        </section>
      ) : (
        <div className="space-y-6">
          {visibleWeeks.map((week) => {
            const sortedEntries = [...week.entries].sort((a, b) => {
              const dateCompare = dateKey(a.date).localeCompare(dateKey(b.date));
              if (dateCompare !== 0) return dateCompare;
              return (a.startTime || "").localeCompare(b.startTime || "");
            });

            const reviewedCount = sortedEntries.filter((entry) => reviewedEntries.has(entry.id)).length;
            const allReviewed = sortedEntries.length > 0 && reviewedCount === sortedEntries.length;
            const isSubmitted = week.status === "SUBMITTED";
            const returnTo = `/admin/approvals?weekStart=${encodeURIComponent(selectedWeekStart)}`;

            const entriesByDay = new Map<string, ApprovalEntry[]>();
            for (const entry of sortedEntries) {
              const key = dateKey(entry.date);
              entriesByDay.set(key, [...(entriesByDay.get(key) ?? []), entry]);
            }

            return (
              <section
                key={week.id}
                className={`overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ${
                  allReviewed && isSubmitted ? "ring-emerald-300" : "ring-slate-200"
                }`}
              >
                <div className="flex flex-col gap-4 border-b border-slate-200 bg-slate-50 px-5 py-5 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-xl font-semibold text-slate-900">{employeeName(week)}</h2>
                      <StatusBadge status={week.status} />
                    </div>
                    <div className="mt-1 text-sm text-slate-600">
                      Week commencing {formatDate(week.weekStart)}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <SummaryPill label="Regular" value={fmt2(week.computed.totals.regularHours)} />
                    <SummaryPill label="Overtime" value={fmt2(week.computed.totals.overtimeTotal)} />
                    <SummaryPill label="Top-up" value={fmt2(week.computed.totals.businessTopUpHours)} />
                    <SummaryPill label="Paid" value={fmt2(week.computed.totals.paidHours)} />
                  </div>
                </div>

                <div className="p-5">
                  {sortedEntries.length === 0 ? (
                    <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600 ring-1 ring-slate-200">
                      No entries recorded for this employee.
                    </div>
                  ) : (
                    <div className="space-y-5">
                      {Array.from(entriesByDay.entries()).map(([dayIso, dayEntries]) => {
                        const computedDay = week.computed.days.find((day) => day.date === dayIso);
                        return (
                          <div key={dayIso} className="overflow-hidden rounded-2xl ring-1 ring-slate-200">
                            <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 px-4 py-3">
                              <div>
                                <div className="font-semibold text-slate-900">{formatDay(dayIso)}</div>
                                <div className="mt-0.5 text-xs text-slate-600">
                                  Worked {fmt2(computedDay?.workedHours)}h · Break {fmt2(computedDay?.breakHours)}h · Paid {fmt2(computedDay?.paidHours)}h
                                </div>
                              </div>
                              {computedDay?.overnightCount ? (
                                <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
                                  Overnight × {computedDay.overnightCount}
                                </span>
                              ) : null}
                            </div>

                            <div className="divide-y divide-slate-200">
                              {dayEntries.map((entry) => {
                                const reviewed = reviewedEntries.has(entry.id);
                                const expanded = expandedEntries.has(entry.id);
                                const overtime =
                                  Number(entry.otMonFriHours || 0) +
                                  Number(entry.otSatHours || 0) +
                                  Number(entry.otSunBhHours || 0);
                                const missingTime =
                                  entry.type === "WORK" && (!entry.startTime || !entry.finishTime);

                                return (
                                  <Fragment key={entry.id}>
                                    <div
                                      className={`grid gap-3 px-4 py-4 lg:grid-cols-[auto_1fr_auto_auto] lg:items-center ${
                                        reviewed ? "bg-emerald-50/70" : missingTime ? "bg-red-50/60" : "bg-white"
                                      }`}
                                    >
                                      <div>
                                        <EntryTypeBadge type={entry.type} />
                                      </div>

                                      <div className="min-w-0">
                                        <div className="font-semibold text-slate-900">{getEntryLabel(entry)}</div>
                                        <div className="mt-1 text-xs text-slate-600">
                                          {entry.startTime || "—"}–{entry.finishTime || "—"}
                                          <span className="mx-2 text-slate-300">·</span>
                                          {fmt2(entry.hours)}h
                                          {overtime > 0 ? ` · OT ${fmt2(overtime)}h` : ""}
                                          {entry.overnight ? " · Overnight" : ""}
                                        </div>
                                        {missingTime ? (
                                          <div className="mt-1 text-xs font-semibold text-red-700">Missing start or finish time</div>
                                        ) : null}
                                      </div>

                                      <div className="flex flex-wrap gap-2 lg:justify-end">
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

                                      <div className="lg:text-right">
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
                                          <span className="text-xs text-slate-400">—</span>
                                        )}
                                      </div>
                                    </div>

                                    {expanded ? (
                                      <div className="grid gap-3 bg-slate-50 px-4 py-4 sm:grid-cols-4">
                                        <SummaryPill label="Regular" value={fmt2(entry.regularHours)} />
                                        <SummaryPill label="OT Mon–Fri" value={fmt2(entry.otMonFriHours)} />
                                        <SummaryPill label="OT Saturday" value={fmt2(entry.otSatHours)} />
                                        <SummaryPill label="OT Sunday/BH" value={fmt2(entry.otSunBhHours)} />
                                        {entry.description ? (
                                          <div className="sm:col-span-4 rounded-2xl bg-white px-4 py-3 text-sm text-slate-700 ring-1 ring-slate-200">
                                            <span className="font-semibold">Notes:</span> {entry.description}
                                          </div>
                                        ) : null}
                                      </div>
                                    ) : null}
                                  </Fragment>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className={`border-t px-5 py-5 ${allReviewed && isSubmitted ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-slate-50"}`}>
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <div className="font-semibold text-slate-900">
                        {reviewedCount} of {sortedEntries.length} lines approved
                      </div>
                      <div className="mt-1 text-xs text-slate-600">
                        {allReviewed
                          ? "All lines are reviewed. This employee's week is ready for final approval."
                          : "Approve every line above to unlock final approval for this employee."}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {isSubmitted ? (
                        <>
                          <button
                            type="button"
                            onClick={() => approveAllEntriesForWeek(week)}
                            disabled={allReviewed || sortedEntries.length === 0}
                            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50 disabled:opacity-50"
                          >
                            Approve all lines
                          </button>
                          <button
                            type="button"
                            onClick={() => clearEntriesForWeek(week)}
                            disabled={reviewedCount === 0}
                            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                          >
                            Clear
                          </button>
                          <button
                            type="button"
                            onClick={() => rejectWeek(week)}
                            disabled={Boolean(acting)}
                            className="rounded-xl border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                          >
                            {acting?.weekId === week.id && acting.action === "REJECT" ? "Rejecting…" : "Reject Week"}
                          </button>
                          <button
                            type="button"
                            onClick={() => approveWeek(week)}
                            disabled={!allReviewed || Boolean(acting)}
                            className="rounded-xl bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            {acting?.weekId === week.id && acting.action === "APPROVE" ? "Approving…" : "Approve Week"}
                          </button>
                        </>
                      ) : (
                        <StatusBadge status={week.status} />
                      )}
                    </div>
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      )}
    </main>
  );
}