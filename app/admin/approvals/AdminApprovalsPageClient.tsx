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
  initialWeekStart?: string;
};

type EditingTimes = { weekId: string; entryId: string; startTime: string; finishTime: string };

type ActingState = {
  weekId: string;
  action: "APPROVE" | "REJECT" | "REOPEN" | "SUBMIT_CUTOFF" | "SUBMIT_WEEK";
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

export default function AdminApprovalsPageClient({ initialWeeks, initialWeekStart }: Props) {
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
    initialWeekStart && availableWeekStarts.includes(initialWeekStart) ? initialWeekStart : availableWeekStarts.includes(currentMonday)
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
  const [notice, setNotice] = useState<string | null>(null);
  const [editingTimes, setEditingTimes] = useState<EditingTimes | null>(null);
  const [entryBusy, setEntryBusy] = useState<string | null>(null);
  const busy = Boolean(acting || actingDay || entryBusy);

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
    if (reason === null) return false;
    if (action !== "APPROVE" && !reason?.trim()) { setError("A reason is required."); return false; }
    setActingDay(rowKey(week.id, date)); setError(null);
    try {
      const response = await fetch("/api/day/review", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ weekId: week.id, date, action, comment: reason }) });
      const data = await readJsonOrText(response);
      if (!response.ok) throw new Error(data.error || "Could not review day");
      setWeeks((current) => current.map((item) => item.id === week.id ? { ...item, status: data.week.status, dayApprovals: data.week.dayApprovals } : item));
      return true;
    } catch (error) { setError(error instanceof Error ? error.message : "Could not review day"); return false; }
    finally { setActingDay(null); }
  }

  async function submitCutoff(week: ApprovalWeek, through?: string) {
    if (!window.confirm(through ? `Submit ${employeeName(week)}'s days through ${formatDate(through)} for payroll review? Later days will stay open.` : `Submit ${employeeName(week)}'s entire week for approval? All remaining days will be locked for review.`)) return;
    setActing({ weekId: week.id, action: through ? "SUBMIT_CUTOFF" : "SUBMIT_WEEK" }); setError(null);
    try {
      const response = await fetch("/api/week/submit", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ weekId: week.id, through }) });
      const data = await readJsonOrText(response);
      if (!response.ok) throw new Error(data.error || "Could not submit payroll days");
      setWeeks((current) => current.map((item) => item.id === week.id ? { ...item, status: data.week.status, dayApprovals: data.week.dayApprovals } : item));
      setNotice(through ? "Days submitted through the 15th. They can now be approved." : `${employeeName(week)}'s week submitted. You can now approve their days.`);
    } catch (error) { setError(error instanceof Error ? error.message : "Could not submit payroll days"); }
    finally { setActing(null); }
  }

  async function refreshWeek(weekId: string) {
    const response = await fetch(`/api/week/detail?weekId=${encodeURIComponent(weekId)}`, { cache: "no-store" });
    const data = await readJsonOrText(response);
    if (!response.ok) throw new Error(data.error || "Could not refresh the corrected week");
    const refreshed = { ...data.week, user: data.user || data.week.user, computed: data.computed } as ApprovalWeek;
    setWeeks((current) => current.map((week) => week.id === weekId ? refreshed : week));
    return refreshed;
  }

  async function returnDayForApproval(weekId: string, date: string, hasDay = true) {
    let submissionError: string | null = null;
    if (hasDay) {
      try {
        const response = await fetch("/api/week/submit", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ weekId, date }) });
        const data = await readJsonOrText(response);
        if (!response.ok) throw new Error(data.error || "Could not submit corrected day");
      } catch (error) { submissionError = error instanceof Error ? error.message : "Could not submit corrected day"; }
    }
    await refreshWeek(weekId);
    if (submissionError) throw new Error(`The change was saved, but resubmission failed: ${submissionError}. Use Submit day to retry.`);
  }

  async function prepareEntry(week: ApprovalWeek, entry: ApprovalEntry) {
    const approval = week.dayApprovals.find((day) => dateKey(day.date) === dateKey(entry.date));
    if (week.status === "APPROVED" || week.status === "SUBMITTED" || approval?.status === "APPROVED" || approval?.status === "PENDING") {
      if (!await reviewPersonDay(week, dateKey(entry.date), "REOPEN")) return false;
    }
    setStatusFilter("ALL");
    setError(null); setNotice(null);
    return true;
  }

  async function beginTimeEdit(week: ApprovalWeek, entry: ApprovalEntry) {
    if (busy) return;
    if (editingTimes && editingTimes.entryId !== entry.id && !window.confirm("Discard the unsaved time changes?")) return;
    if (!await prepareEntry(week, entry)) return;
    setEditingTimes({ weekId: week.id, entryId: entry.id, startTime: entry.startTime, finishTime: entry.finishTime });
    setExpandedRows((current) => new Set(current).add(rowKey(week.id, dateKey(entry.date))));
  }

  async function saveTimes(week: ApprovalWeek, entry: ApprovalEntry) {
    if (!editingTimes || busy) return;
    if (!/^(?:[01]\d|2[0-3]):(?:00|15|30|45)$/.test(editingTimes.startTime) || !/^(?:[01]\d|2[0-3]):(?:00|15|30|45)$/.test(editingTimes.finishTime) || editingTimes.startTime === editingTimes.finishTime) {
      setError("Choose different start and finish times in 15-minute steps."); return;
    }
    setEntryBusy(entry.id); setError(null); setNotice(null);
    try {
      const response = await fetch("/api/entry/update", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: entry.id, timesOnly: true, startTime: editingTimes.startTime, finishTime: editingTimes.finishTime }) });
      const data = await readJsonOrText(response);
      if (!response.ok) throw new Error(data.error || "Could not save times");
      setEditingTimes(null);
      await returnDayForApproval(week.id, dateKey(entry.date));
      setNotice("Times saved and totals updated. Approve the corrected day again.");
    } catch (error) { setError(error instanceof Error ? error.message : "Could not save times"); }
    finally { setEntryBusy(null); }
  }

  async function deleteApprovalEntry(week: ApprovalWeek, entry: ApprovalEntry) {
    if (busy || !window.confirm(`Delete ${employeeName(week)}'s entry for ${getEntryLabel(entry)} on ${formatDate(entry.date)} (${entry.startTime}–${entry.finishTime})? Only this entry will be deleted.`)) return;
    if (!await prepareEntry(week, entry)) return;
    setEntryBusy(entry.id);
    try {
      const response = await fetch("/api/entry/delete", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: entry.id }) });
      const data = await readJsonOrText(response);
      if (!response.ok) throw new Error(data.error || "Could not delete entry");
      if (editingTimes?.entryId === entry.id) setEditingTimes(null);
      const hasDay = Boolean(data.computed?.days?.some((day: { date: string }) => day.date === dateKey(entry.date)));
      await returnDayForApproval(week.id, dateKey(entry.date), hasDay);
      setNotice(hasDay ? "Entry deleted and totals updated. Approve the corrected day again." : "Entry deleted and totals updated.");
    } catch (error) { setError(error instanceof Error ? error.message : "Could not delete entry"); }
    finally { setEntryBusy(null); }
  }

  async function editEntryDetails(week: ApprovalWeek, entry: ApprovalEntry) {
    if (busy || (editingTimes && !window.confirm("Discard the unsaved time changes and open the full entry editor?")) || !await prepareEntry(week, entry)) return;
    const returnTo = `/admin/approvals?weekStart=${selectedWeekStart}`;
    window.location.assign(`/timesheet/entry/${encodeURIComponent(entry.id)}?admin=1&returnTo=${encodeURIComponent(returnTo)}`);
  }

  async function submitCorrectedDay(week: ApprovalWeek, date: string) {
    setEntryBusy(`${week.id}:${date}`); setError(null);
    try { await returnDayForApproval(week.id, date); setNotice("Day submitted. It can now be approved."); }
    catch (error) { setError(error instanceof Error ? error.message : "Could not submit day"); }
    finally { setEntryBusy(null); }
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
            Use Edit / delete to correct an entry and refresh its totals here.
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
      {notice ? <div role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</div> : null}

      <section className="grid gap-4 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200 lg:grid-cols-[1fr_1fr_1fr_1.2fr]">
        <div>
          <label className="block text-xs font-semibold text-slate-600">
            Week commencing Monday
          </label>
          <div className="mt-1 flex gap-2">
            <button
              type="button"
              disabled={busy || Boolean(editingTimes)}
              onClick={() =>
                setSelectedWeekStart((current) => addWeeks(current, -1))
              }
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50"
            >
              ←
            </button>

            <input
              type="date"
              disabled={busy || Boolean(editingTimes)}
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
              disabled={busy || Boolean(editingTimes)}
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
            disabled={busy || Boolean(editingTimes)}
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

      {visibleWeeks.some((week) => week.status === "DRAFT" || week.status === "REJECTED") ? (
        <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">Submit employee weeks</h2>
          <p className="mt-1 text-sm text-slate-600">Submit a week on behalf of an employee, then approve their days below. Bank-holiday pay requires an entered holiday line.</p>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {visibleWeeks.filter((week) => week.status === "DRAFT" || week.status === "REJECTED").map((week) => (
              <div key={week.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3">
                <div>
                  <div className="font-semibold text-slate-900">{employeeName(week)}</div>
                  <div className="text-xs text-slate-500">{week.entries.length ? `${week.entries.length} entries · ${fmt2(week.computed.totals.paidHours)} paid hours` : "Add entries before submitting"}</div>
                </div>
                <button type="button" onClick={() => submitCutoff(week)} disabled={busy || Boolean(editingTimes) || !week.entries.length} className="shrink-0 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-40">
                  {acting?.weekId === week.id && acting.action === "SUBMIT_WEEK" ? "Submitting…" : "Submit week"}
                </button>
              </div>
            ))}
          </div>
        </section>
      ) : null}

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
                                    <button type="button" disabled={busy || Boolean(editingTimes)} onClick={() => reviewPersonDay(week, day.iso, "REOPEN")} className="block text-xs text-amber-800 underline">Reopen day</button>
                                  </div>
                                ) : canApproveDay ? (
                                  <div className="space-y-2">
                                  <button
                                    type="button"
                                    onClick={() => reviewPersonDay(week, day.iso, "APPROVE")}
                                    disabled={busy || Boolean(editingTimes)}
                                    className={`min-w-[112px] rounded-lg px-3 py-2 text-xs font-bold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-100 ${
                                      reviewed
                                        ? "bg-emerald-700"
                                        : "bg-emerald-500 hover:bg-emerald-400"
                                    }`}
                                  >
                                    {actingDay === key ? "Saving…" : "Approve Day"}
                                  </button>
                                  <button type="button" disabled={busy || Boolean(editingTimes)} onClick={() => reviewPersonDay(week, day.iso, "REJECT")} className="block text-xs text-red-700 underline">Reject day</button>
                                  </div>
                                ) : (
                                  <span className="text-xs text-slate-500">{dayApproval?.status === "REJECTED" ? "Returned for correction" : "Not submitted"}</span>
                                )}
                                {dayApproval?.status === "REJECTED" && computedDay ? <button type="button" disabled={busy || Boolean(editingTimes)} onClick={() => submitCorrectedDay(week, day.iso)} className="mt-2 block text-xs font-semibold text-blue-700 underline">Submit day</button> : null}
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
                                <StatusBadge status={reviewed && computedDay ? "APPROVED" : !computedDay ? "NO ENTRY" : dayApproval?.status === "REJECTED" ? "REJECTED" : canApproveDay ? "SUBMITTED" : "DRAFT"} />
                              </td>

                              <td className="px-4 py-4">
                                <div className="flex justify-end gap-2">
                                  {entries.length > 0 ? (
                                    <button
                                      type="button"
                                      disabled={busy || Boolean(editingTimes)}
                                      onClick={() => toggleExpandedRow(key)}
                                      className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold hover:bg-slate-50"
                                    >
                                      {expanded ? "Hide entries" : "Edit / delete"}
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

                                              <div className="mt-3 flex flex-wrap justify-end gap-2">
                                                {entry.type === "WORK" || entry.type === "TRAINING" ? <button type="button" disabled={busy || editingTimes?.entryId === entry.id} onClick={() => beginTimeEdit(week, entry)} className="rounded-lg bg-cyan-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">Edit times</button> : null}
                                                <button type="button" disabled={busy} onClick={() => editEntryDetails(week, entry)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold disabled:opacity-50">Edit entry</button>
                                                <button type="button" disabled={busy || Boolean(editingTimes)} onClick={() => deleteApprovalEntry(week, entry)} className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 disabled:opacity-50">{entryBusy === entry.id ? "Saving…" : "Delete"}</button>
                                              </div>
                                            </div>
                                          </div>
                                          {editingTimes?.entryId === entry.id ? (
                                            <form onSubmit={(event) => { event.preventDefault(); void saveTimes(week, entry); }} className="mt-4 space-y-3 rounded-xl bg-slate-50 p-3">
                                              <div className="grid grid-cols-2 gap-3">
                                                <label className="text-xs font-semibold">Start time<input type="time" step={900} required value={editingTimes.startTime} onChange={(event) => setEditingTimes((current) => current ? { ...current, startTime: event.target.value } : null)} disabled={busy} className="mt-1 block w-full rounded-lg border border-slate-200 bg-white p-2 text-base" /></label>
                                                <label className="text-xs font-semibold">Finish time<input type="time" step={900} required value={editingTimes.finishTime} onChange={(event) => setEditingTimes((current) => current ? { ...current, finishTime: event.target.value } : null)} disabled={busy} className="mt-1 block w-full rounded-lg border border-slate-200 bg-white p-2 text-base" /></label>
                                              </div>
                                              <p className="text-xs text-slate-600">Use 15-minute steps. A finish time earlier than the start is treated as the following day.</p>
                                              <div className="flex flex-wrap gap-2">
                                                <button type="submit" disabled={busy} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">{entryBusy === entry.id ? "Saving…" : "Save and return for approval"}</button>
                                                <button type="button" disabled={busy} onClick={() => { setEditingTimes(null); setNotice("No time changes saved. A reopened day stays open until submitted and approved again."); }} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold">Cancel</button>
                                              </div>
                                            </form>
                                          ) : null}
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
                                disabled={busy || Boolean(editingTimes)}
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
                                  !allWeekDaysApproved || busy || Boolean(editingTimes)
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
                              disabled={busy || Boolean(editingTimes)}
                              className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-50"
                            >
                              {acting?.weekId === week.id &&
                              acting.action === "REOPEN"
                                ? "Reopening…"
                                : "Reopen Week"}
                            </button>
                          ) : (
                            <>
                              {cutoff && canSubmitCutoff ? <button type="button" onClick={() => submitCutoff(week, cutoff)} disabled={busy || Boolean(editingTimes)} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Submit up to 15th</button> : null}
                              {week.computed.days.length ? <button type="button" onClick={() => submitCutoff(week)} disabled={busy || Boolean(editingTimes)} className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-800 disabled:opacity-50">Submit week</button> : null}
                            </>
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
