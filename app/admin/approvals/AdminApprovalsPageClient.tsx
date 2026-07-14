"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

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
  return (
    entry.job?.trim() ||
    entry.description?.trim() ||
    displayType(entry.type)
  );
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

  return {
    error: (await response.text()).slice(0, 1200),
  };
}

export default function AdminApprovalsPageClient({
  initialWeeks,
}: Props) {
  const currentMonday = formatInputDate(
    startOfWeekMonday(new Date()),
  );

  const availableWeekStarts = useMemo(() => {
    return Array.from(
      new Set(initialWeeks.map((week) => dateKey(week.weekStart))),
    ).sort((a, b) => b.localeCompare(a));
  }, [initialWeeks]);

  const [weeks, setWeeks] = useState(initialWeeks);

  const [selectedWeekStart, setSelectedWeekStart] = useState(
    availableWeekStarts.includes(currentMonday)
      ? currentMonday
      : availableWeekStarts[0] || currentMonday,
  );

  const [statusFilter, setStatusFilter] = useState("ALL");
  const [expandedWeeks, setExpandedWeeks] = useState<Set<string>>(
    new Set(),
  );

  const [comment, setComment] = useState("");
  const [acting, setActing] = useState<ActingState>(null);
  const [bulkApproving, setBulkApproving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedMonday = useMemo(
    () => parseLocalDate(selectedWeekStart),
    [selectedWeekStart],
  );

  const days = useMemo(() => {
    return DAY_NAMES.map((name, index) => {
      const date = addDays(selectedMonday, index);

      return {
        name,
        iso: formatInputDate(date),
      };
    });
  }, [selectedMonday]);

  const visibleWeeks = useMemo(() => {
    return weeks
      .filter(
        (week) => dateKey(week.weekStart) === selectedWeekStart,
      )
      .filter(
        (week) =>
          statusFilter === "ALL" || week.status === statusFilter,
      )
      .sort((a, b) =>
        employeeName(a).localeCompare(employeeName(b)),
      );
  }, [weeks, selectedWeekStart, statusFilter]);

  const submittedWeeks = visibleWeeks.filter(
    (week) => week.status === "SUBMITTED",
  );

  const totals = useMemo(() => {
    return visibleWeeks.reduce(
      (acc, week) => {
        acc.paid += Number(week.computed.totals.paidHours || 0);
        acc.overtime += Number(
          week.computed.totals.overtimeTotal || 0,
        );
        acc.overnights += Number(
          week.computed.totals.overnightCount || 0,
        );

        return acc;
      },
      {
        paid: 0,
        overtime: 0,
        overnights: 0,
      },
    );
  }, [visibleWeeks]);

  function toggleExpanded(weekId: string) {
    setExpandedWeeks((current) => {
      const next = new Set(current);

      if (next.has(weekId)) {
        next.delete(weekId);
      } else {
        next.add(weekId);
      }

      return next;
    });
  }

  async function reviewWeek(
    weekId: string,
    action: "APPROVE" | "REJECT",
    reviewComment?: string | null,
  ) {
    setError(null);
    setActing({ weekId, action });

    try {
      const response = await fetch("/api/week/review", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          weekId,
          action,
          comment: reviewComment?.trim() || null,
        }),
      });

      const data = await readJsonOrText(response);

      if (!response.ok) {
        throw new Error(
          (data as { error?: string }).error ||
            "Failed to review week",
        );
      }

      setWeeks((current) =>
        current.map((week) =>
          week.id === weekId
            ? {
                ...week,
                status:
                  action === "APPROVE" ? "APPROVED" : "DRAFT",
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

  async function approveAllSubmitted() {
    if (submittedWeeks.length === 0) return;

    const confirmed = window.confirm(
      `Approve ${submittedWeeks.length} submitted timesheet${
        submittedWeeks.length === 1 ? "" : "s"
      } for the week commencing ${formatDate(selectedWeekStart)}?`,
    );

    if (!confirmed) return;

    setError(null);
    setBulkApproving(true);

    try {
      for (const week of submittedWeeks) {
        const response = await fetch("/api/week/review", {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            weekId: week.id,
            action: "APPROVE",
            comment: comment.trim() || null,
          }),
        });

        const data = await readJsonOrText(response);

        if (!response.ok) {
          throw new Error(
            (data as { error?: string }).error ||
              `Failed to approve ${employeeName(week)}`,
          );
        }

        setWeeks((current) =>
          current.map((item) =>
            item.id === week.id
              ? {
                  ...item,
                  status: "APPROVED",
                }
              : item,
          ),
        );
      }

      setComment("");
    } catch (bulkError) {
      setError(
        bulkError instanceof Error
          ? bulkError.message
          : "Failed to approve submitted weeks",
      );
    } finally {
      setBulkApproving(false);
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
            Compare everyone&apos;s times and jobs by day before
            approving their submitted timesheets.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/timesheets"
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50"
          >
            Detailed Timesheets
          </Link>

          <button
            type="button"
            onClick={approveAllSubmitted}
            disabled={
              bulkApproving || submittedWeeks.length === 0
            }
            className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {bulkApproving
              ? "Approving…"
              : `Approve All Submitted (${submittedWeeks.length})`}
          </button>
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
                setSelectedWeekStart((current) =>
                  addWeeks(current, -1),
                )
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
                    startOfWeekMonday(
                      parseLocalDate(event.target.value),
                    ),
                  ),
                )
              }
              className="min-w-0 flex-1 rounded-xl bg-white px-3 py-2 text-sm ring-1 ring-slate-200 outline-none focus:ring-2 focus:ring-cyan-300"
            />

            <button
              type="button"
              onClick={() =>
                setSelectedWeekStart((current) =>
                  addWeeks(current, 1),
                )
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
            onChange={(event) =>
              setStatusFilter(event.target.value)
            }
            className="mt-1 w-full rounded-xl bg-white px-3 py-2 text-sm ring-1 ring-slate-200 outline-none focus:ring-2 focus:ring-cyan-300"
          >
            <option value="ALL">All statuses</option>
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
          <SummaryPill
            label="Employees"
            value={visibleWeeks.length}
          />
          <SummaryPill label="Paid" value={fmt2(totals.paid)} />
          <SummaryPill
            label="Overnights"
            value={totals.overnights}
          />
        </div>
      </section>

      {visibleWeeks.length === 0 ? (
        <section className="rounded-3xl bg-white p-8 text-center text-sm text-slate-600 shadow-sm ring-1 ring-slate-200">
          No timesheets were found for the selected week and
          status.
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

              return {
                week,
                entries,
                computedDay,
              };
            });

            return (
              <section
                key={day.iso}
                className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-slate-200"
              >
                <div className="flex items-center justify-between bg-slate-50 px-5 py-4">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">
                      {day.name}
                    </h2>

                    <div className="text-xs text-slate-500">
                      {formatShortDate(day.iso)}
                    </div>
                  </div>

                  <div className="text-xs text-slate-500">
                    {dayRows.filter((row) => row.entries.length > 0)
                      .length}{" "}
                    employee entries
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1080px] text-sm">
                    <thead>
                      <tr className="border-t border-slate-200 bg-white text-left text-xs font-semibold text-slate-600">
                        <th className="px-4 py-3">Employee</th>
                        <th className="px-4 py-3">Start</th>
                        <th className="px-4 py-3">Finish</th>
                        <th className="px-4 py-3">Paid</th>
                        <th className="px-4 py-3">OT</th>
                        <th className="px-4 py-3">Jobs / Sites</th>
                        <th className="px-4 py-3">Overnight</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3 text-right">
                          Actions
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {dayRows.map(
                        ({ week, entries, computedDay }) => {
                          const expanded = expandedWeeks.has(
                            `${week.id}:${day.iso}`,
                          );

                          const starts = entries
                            .map((entry) => entry.startTime)
                            .filter(Boolean);

                          const finishes = entries
                            .map((entry) => entry.finishTime)
                            .filter(Boolean);

                          const overtime =
                            Number(
                              computedDay?.otMonFriHours || 0,
                            ) +
                            Number(computedDay?.otSatHours || 0) +
                            Number(
                              computedDay?.otSunBhHours || 0,
                            );

                          const jobs = [
                            ...new Set(
                              entries.map(getEntryLabel).filter(Boolean),
                            ),
                          ];

                          const hasLongShift =
                            Number(computedDay?.workedHours || 0) > 12;

                          const rowKey = `${week.id}:${day.iso}`;

                          return (
                            <>
                              <tr
                                key={rowKey}
                                className={`border-t border-slate-200 align-top ${
                                  hasLongShift
                                    ? "bg-amber-50/60"
                                    : ""
                                }`}
                              >
                                <td className="px-4 py-4">
                                  <div className="font-semibold text-slate-900">
                                    {employeeName(week)}
                                  </div>

                                  {hasLongShift ? (
                                    <div className="mt-1 text-[11px] font-semibold text-amber-700">
                                      Long shift
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
                                  {overtime > 0
                                    ? fmt2(overtime)
                                    : "—"}
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
                                        onClick={() =>
                                          setExpandedWeeks(
                                            (current) => {
                                              const next = new Set(
                                                current,
                                              );

                                              if (
                                                next.has(rowKey)
                                              ) {
                                                next.delete(rowKey);
                                              } else {
                                                next.add(rowKey);
                                              }

                                              return next;
                                            },
                                          )
                                        }
                                        className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold hover:bg-slate-50"
                                      >
                                        {expanded
                                          ? "Hide"
                                          : "Details"}
                                      </button>
                                    ) : null}

                                    {week.status === "SUBMITTED" ? (
                                      <>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            rejectWeek(week)
                                          }
                                          disabled={Boolean(acting)}
                                          className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                                        >
                                          Reject
                                        </button>

                                        <button
                                          type="button"
                                          onClick={() =>
                                            reviewWeek(
                                              week.id,
                                              "APPROVE",
                                              comment,
                                            )
                                          }
                                          disabled={Boolean(acting)}
                                          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
                                        >
                                          {acting?.weekId ===
                                            week.id &&
                                          acting.action ===
                                            "APPROVE"
                                            ? "Approving…"
                                            : "Approve"}
                                        </button>
                                      </>
                                    ) : null}
                                  </div>
                                </td>
                              </tr>

                              {expanded ? (
                                <tr
                                  key={`${rowKey}:detail`}
                                  className="border-t border-slate-100 bg-slate-50"
                                >
                                  <td
                                    colSpan={9}
                                    className="px-5 py-4"
                                  >
                                    <div className="grid gap-3 lg:grid-cols-2">
                                      {entries.map((entry) => {
                                        const entryOvertime =
                                          Number(
                                            entry.otMonFriHours || 0,
                                          ) +
                                          Number(
                                            entry.otSatHours || 0,
                                          ) +
                                          Number(
                                            entry.otSunBhHours || 0,
                                          );

                                        return (
                                          <div
                                            key={entry.id}
                                            className="rounded-2xl bg-white p-4 ring-1 ring-slate-200"
                                          >
                                            <div className="flex items-start justify-between gap-3">
                                              <div>
                                                <EntryTypeBadge
                                                  type={entry.type}
                                                />

                                                <div className="mt-2 font-semibold text-slate-900">
                                                  {getEntryLabel(entry)}
                                                </div>

                                                <div className="mt-1 text-xs text-slate-600">
                                                  {entry.startTime || "—"}–
                                                  {entry.finishTime || "—"}
                                                </div>

                                                {entry.description ? (
                                                  <div className="mt-2 text-xs text-slate-600">
                                                    {
                                                      entry.description
                                                    }
                                                  </div>
                                                ) : null}
                                              </div>

                                              <div className="text-right">
                                                <div className="font-semibold text-slate-900">
                                                  {fmt2(entry.hours)}h
                                                </div>

                                                <div className="mt-1 text-[11px] text-slate-500">
                                                  Regular{" "}
                                                  {fmt2(
                                                    entry.regularHours,
                                                  )}
                                                  {entryOvertime > 0
                                                    ? ` • OT ${fmt2(
                                                        entryOvertime,
                                                      )}`
                                                    : ""}
                                                </div>

                                                {entry.overnight ? (
                                                  <div className="mt-1 text-[11px] font-semibold text-emerald-700">
                                                    Overnight
                                                  </div>
                                                ) : null}

                                                <Link
                                                  href={`/timesheet/entry/${encodeURIComponent(
                                                    entry.id,
                                                  )}?admin=1&adminWeekId=${encodeURIComponent(
                                                    week.id,
                                                  )}`}
                                                  className="mt-3 inline-flex rounded-lg bg-cyan-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-cyan-500"
                                                >
                                                  Edit
                                                </Link>
                                              </div>
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </td>
                                </tr>
                              ) : null}
                            </>
                          );
                        },
                      )}
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
            <table className="w-full min-w-[850px] text-sm">
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
                </tr>
              </thead>

              <tbody>
                {visibleWeeks.map((week) => (
                  <tr
                    key={week.id}
                    className="border-t border-slate-200"
                  >
                    <td className="px-4 py-3 font-semibold">
                      {employeeName(week)}
                    </td>
                    <td className="px-4 py-3">
                      {fmt2(week.computed.totals.regularHours)}
                    </td>
                    <td className="px-4 py-3">
                      {fmt2(
                        week.computed.totals.otMonFriHours,
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {fmt2(week.computed.totals.otSatHours)}
                    </td>
                    <td className="px-4 py-3">
                      {fmt2(
                        week.computed.totals.otSunBhHours,
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {fmt2(
                        week.computed.totals.businessTopUpHours,
                      )}
                    </td>
                    <td className="px-4 py-3 font-semibold">
                      {fmt2(week.computed.totals.paidHours)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={week.status} />
                    </td>
                  </tr>
                ))}
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