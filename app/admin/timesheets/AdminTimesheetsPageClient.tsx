"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

export type AdminTimesheetWeekSummary = {
  id: string;
  weekStart: string;
  status: string;
  totalHours: number;
  regularHours: number;
  overtimeHours: number;
  overnightCount: number;
  user?: {
    id?: string | null;
    name?: string | null;
    email?: string | null;
  };
};

type Entry = {
  id: string;
  date: string;
  type?: string;
  job: string;
  hours: number;
  regularHours: number;
  otMonFriHours: number;
  otSatHours: number;
  otSunBhHours: number;
  startTime: string;
  finishTime: string;
  overnight: boolean;
  description: string | null;
};

type Audit = {
  id: string;
  action: string;
  comment: string | null;
  createdAt: string;
  performedBy: {
    id: string;
    name: string | null;
    email: string | null;
  } | null;
};

type WeekComputed = {
  days: {
    date: string;
    workedHours?: number;
    workingHours?: number;
    breakHours: number;
    paidHours: number;
    regularHours?: number;
    otMonFriHours?: number;
    otSatHours?: number;
    otSunBhHours?: number;
    overtimeTotal?: number;
    overnightCount?: number;
  }[];
  totals: {
    workedHours?: number;
    workingHours?: number;
    breakHours?: number;
    paidHours?: number;
    regularHours?: number;
    otMonFriHours?: number;
    otSatHours?: number;
    otSunBhHours?: number;
    overtimeTotal?: number;
    overnightCount?: number;
    overnightAllowance?: number;
    businessTopUpHours?: number;
  };
  rules?: {
    workingTypes?: string[];
    paidNonWorkingTypes?: string[];
    breakThresholdHours?: number;
    breakHours?: number;
    unpaidBreakHours?: number;
    unpaid?: boolean;
  };
};

type WeekDetail = {
  id: string;
  weekStart: string;
  status: string;
  user?: {
    id?: string | null;
    name?: string | null;
    email?: string | null;
  };
  entries: Entry[];
  audits?: Audit[];
  computed?: WeekComputed;
};

type Props = {
  initialWeeks: AdminTimesheetWeekSummary[];
};

const WORKING_TYPES = new Set(["WORK", "TRAINING"]);
const BREAK_THRESHOLD_HOURS = 8;
const BREAK_HOURS = 0.5;

function getUserLabel(user?: { name?: string | null; email?: string | null }) {
  return user?.name?.trim() || user?.email || "Unknown user";
}

function getUserId(user?: { id?: string | null }) {
  return user?.id || "unknown";
}

function getDetailTotals(detail: WeekDetail | null) {
  const totals = detail?.computed?.totals;

  return {
    hours: Number(totals?.workedHours ?? totals?.workingHours) || 0,
    regular: Number(totals?.regularHours) || 0,
    otMonFri: Number(totals?.otMonFriHours) || 0,
    otSat: Number(totals?.otSatHours) || 0,
    otSunBh: Number(totals?.otSunBhHours) || 0,
  };
}

export default function AdminTimesheetsPageClient({ initialWeeks }: Props) {
  const [weeks, setWeeks] = useState<AdminTimesheetWeekSummary[]>(initialWeeks);
  const [selectedUser, setSelectedUser] = useState("ALL");
  const [selectedStatus, setSelectedStatus] = useState("ALL");
  const [selectedId, setSelectedId] = useState<string | null>(
    initialWeeks[0]?.id ?? null,
  );

  const [detailLoading, setDetailLoading] = useState(false);
  const [detail, setDetail] = useState<WeekDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [comment, setComment] = useState("");
  const [acting, setActing] = useState<null | "APPROVE" | "REJECT" | "DELETE">(
    null,
  );

  const users = useMemo(() => {
    const map = new Map<string, string>();

    for (const week of weeks) {
      map.set(getUserId(week.user), getUserLabel(week.user));
    }

    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [weeks]);

  const filteredWeeks = useMemo(() => {
    return weeks.filter((week) => {
      if (selectedUser !== "ALL" && getUserId(week.user) !== selectedUser) {
        return false;
      }

      if (selectedStatus !== "ALL" && week.status !== selectedStatus) {
        return false;
      }

      return true;
    });
  }, [weeks, selectedUser, selectedStatus]);

  const selectedWeek = useMemo(() => {
    return weeks.find((week) => week.id === selectedId) ?? null;
  }, [weeks, selectedId]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }

    loadDetail(selectedId);
  }, [selectedId]);

  useEffect(() => {
    if (filteredWeeks.length === 0) {
      setSelectedId(null);
      return;
    }

    if (!selectedId || !filteredWeeks.some((week) => week.id === selectedId)) {
      setSelectedId(filteredWeeks[0].id);
    }
  }, [filteredWeeks, selectedId]);

  async function loadDetail(weekId: string) {
    setDetailLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/week/detail?weekId=${encodeURIComponent(weekId)}`,
        { cache: "no-store" },
      );

      const data = await readJsonOrText(response);

      if (!response.ok) {
        throw new Error((data as any)?.error ?? "Failed to load week detail");
      }

      setDetail((data as any).week as WeekDetail);
    } catch (err: any) {
      setDetail(null);
      setError(err?.message ?? "Failed to load week detail");
    } finally {
      setDetailLoading(false);
    }
  }

  async function review(action: "APPROVE" | "REJECT") {
    if (!selectedWeek) return;

    setError(null);
    setActing(action);

    try {
      const response = await fetch("/api/week/review", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          weekId: selectedWeek.id,
          action,
          comment: comment.trim() || null,
        }),
      });

      const data = await readJsonOrText(response);

      if (!response.ok) {
        throw new Error((data as any)?.error ?? "Failed to review week");
      }

      const nextStatus = action === "APPROVE" ? "APPROVED" : "DRAFT";

      setWeeks((prev) =>
        prev.map((week) =>
          week.id === selectedWeek.id
            ? {
                ...week,
                status: nextStatus,
              }
            : week,
        ),
      );

      setComment("");
      await loadDetail(selectedWeek.id);
    } catch (err: any) {
      setError(err?.message ?? "Failed to review week");
    } finally {
      setActing(null);
    }
  }

  async function deleteWeek() {
    if (!detail) return;

    const who = getUserLabel(detail.user);

    const confirmed = window.confirm(
      `Delete timesheet week for ${who}?\n\nWeek: ${weekRangeLabel(
        detail.weekStart,
      )}\n\nThis cannot be undone.`,
    );

    if (!confirmed) return;

    setError(null);
    setActing("DELETE");

    try {
      const response = await fetch(
        `/api/admin/timesheets/${encodeURIComponent(detail.id)}/delete`,
        {
          method: "DELETE",
        },
      );

      const data = await readJsonOrText(response);

      if (!response.ok) {
        throw new Error((data as any)?.error ?? "Failed to delete week");
      }

      setWeeks((prev) => prev.filter((week) => week.id !== detail.id));
      setDetail(null);
      setSelectedId(null);
    } catch (err: any) {
      setError(err?.message ?? "Failed to delete week");
    } finally {
      setActing(null);
    }
  }

 const computed = useMemo<WeekComputed | null>(() => {
  if (!detail) return null;

  // Always use the API calculation. Only fall back if nothing was returned.
  if (detail.computed) {
    return detail.computed;
  }

  return computeFallback(detail.entries ?? []);
}, [detail]);

  const safeTotals = useMemo(() => {
  const totals = computed?.totals;

  return {
    hours: Number(totals?.workedHours ?? totals?.workingHours) || 0,
    regular: Number(totals?.regularHours) || 0,
    otMonFri: Number(totals?.otMonFriHours) || 0,
    otSat: Number(totals?.otSatHours) || 0,
    otSunBh: Number(totals?.otSunBhHours) || 0,
    paid: Number(totals?.paidHours) || 0,
    overtimeTotal: Number(totals?.overtimeTotal) || 0,
    overnightCount: Number(totals?.overnightCount) || 0,
  };
}, [computed]);

  const groupedByDay = useMemo(() => {
  const entries = detail?.entries ?? [];
  const map = new Map<string, Entry[]>();

  for (const entry of entries) {
    const key = isoDate(new Date(entry.date));
    map.set(key, [...(map.get(key) ?? []), entry]);
  }

  return Array.from(map.keys())
    .sort()
    .map((key) => ({
      dayIso: key,
      entries: (map.get(key) ?? []).slice(),
    }));
}, [detail]);

const breakLabel = computed?.rules?.unpaidBreakHours
  ? "0.5h deducted when daily working ≥ 8h"
  : "0.5h deducted when daily working ≥ 8h";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            Admin Timesheets
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            View any employee week, including drafts, and approve submitted
            weeks from the full weekly view.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href="/approvals"
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50"
          >
            Approvals queue
          </Link>

          <Link
            href="/admin/users"
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50"
          >
            User admin
          </Link>
        </div>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      <section className="grid gap-4 rounded-3xl bg-white p-5 ring-1 ring-slate-200 shadow-sm md:grid-cols-3">
        <label className="text-sm">
          <span className="mb-1 block font-semibold text-slate-700">
            Employee
          </span>
          <select
            value={selectedUser}
            onChange={(event) => {
              setSelectedUser(event.target.value);
              setSelectedId(null);
            }}
            className="w-full rounded-xl bg-white px-3 py-2 text-slate-900 ring-1 ring-slate-200 outline-none focus:ring-2 focus:ring-cyan-300"
          >
            <option value="ALL">All employees</option>
            {users.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm">
          <span className="mb-1 block font-semibold text-slate-700">
            Status
          </span>
          <select
            value={selectedStatus}
            onChange={(event) => {
              setSelectedStatus(event.target.value);
              setSelectedId(null);
            }}
            className="w-full rounded-xl bg-white px-3 py-2 text-slate-900 ring-1 ring-slate-200 outline-none focus:ring-2 focus:ring-cyan-300"
          >
            <option value="ALL">All statuses</option>
            <option value="DRAFT">Draft</option>
            <option value="SUBMITTED">Submitted</option>
            <option value="APPROVED">Approved</option>
            <option value="REJECTED">Rejected</option>
          </select>
        </label>

        <div className="rounded-2xl bg-slate-50 px-4 py-3 ring-1 ring-slate-200">
          <div className="text-xs font-semibold text-slate-600">
            Matching weeks
          </div>
          <div className="mt-1 text-lg font-semibold text-slate-900">
            {filteredWeeks.length}
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.4fr]">
        <section className="rounded-3xl bg-white p-6 ring-1 ring-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-slate-900">
              Timesheet weeks
            </div>
            <div className="text-xs text-slate-500">{weeks.length} loaded</div>
          </div>

          <div className="mt-4 max-h-[720px] space-y-3 overflow-auto pr-1">
            {filteredWeeks.length === 0 ? (
              <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600 ring-1 ring-slate-200">
                No matching weeks.
              </div>
            ) : (
              filteredWeeks.map((week) => {
                const active = week.id === selectedId;
                const who = getUserLabel(week.user);

                return (
                  <button
                    key={week.id}
                    type="button"
                    onClick={() => setSelectedId(week.id)}
                    className={
                      active
                        ? "w-full rounded-2xl bg-cyan-50 p-4 text-left ring-2 ring-cyan-300"
                        : "w-full rounded-2xl bg-white p-4 text-left ring-1 ring-slate-200 hover:bg-slate-50"
                    }
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-slate-900">
                          {who}
                        </div>
                        <div className="mt-1 text-xs text-slate-600">
                          {weekRangeLabel(week.weekStart)}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          WeekStart: {isoDate(new Date(week.weekStart))}
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="text-sm font-semibold text-slate-900">
                          {fmt2(week.totalHours)}h
                        </div>
                        <div className="mt-0.5 text-[11px] text-slate-600">
                          Reg {fmt2(week.regularHours)} • OT{" "}
                          {fmt2(week.overtimeHours)}
                        </div>
                        <div className="mt-1">
                          <StatusBadge status={week.status} />
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </section>

        <section className="rounded-3xl bg-white p-6 ring-1 ring-slate-200 shadow-sm">
          {!selectedWeek ? (
            <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600 ring-1 ring-slate-200">
              Select a week to view it.
            </div>
          ) : detailLoading ? (
            <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600 ring-1 ring-slate-200">
              Loading week detail…
            </div>
          ) : !detail ? (
            <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600 ring-1 ring-slate-200">
              No detail available.
            </div>
          ) : (
            <div className="space-y-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="text-sm font-semibold text-slate-900">
                    {getUserLabel(detail.user)}
                  </div>
                  <div className="mt-1 text-xs text-slate-600">
                    Week: {weekRangeLabel(detail.weekStart)}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    WeekStart: {isoDate(new Date(detail.weekStart))}
                  </div>
                  <div className="mt-2">
                    <StatusBadge status={detail.status} />
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <div className="rounded-xl bg-cyan-50 px-4 py-2 text-sm font-semibold text-cyan-900 ring-1 ring-cyan-200">
                    Viewing: {getUserLabel(detail.user)}
                  </div>

                  <Link
                    href={`/approvals/audit?weekId=${encodeURIComponent(
                      detail.id,
                    )}`}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50"
                  >
                    Audit trail
                  </Link>

                  <button
                    type="button"
                    onClick={deleteWeek}
                    disabled={!!acting}
                    className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-50"
                  >
                    {acting === "DELETE" ? "Deleting…" : "Delete Week"}
                  </button>

                  {detail.status === "SUBMITTED" ? (
                    <>
                      <button
                        type="button"
                        onClick={() => review("REJECT")}
                        disabled={!!acting}
                        className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50 disabled:opacity-50"
                      >
                        {acting === "REJECT" ? "Rejecting…" : "Reject"}
                      </button>

                      <button
                        type="button"
                        onClick={() => review("APPROVE")}
                        disabled={!!acting}
                        className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-50"
                      >
                        {acting === "APPROVE" ? "Approving…" : "Approve"}
                      </button>
                    </>
                  ) : (
                    <div className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 ring-1 ring-slate-200">
                      Read only
                    </div>
                  )}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-4">
                <Pill label="Status" value={detail.status} />
                <Pill
                  label="Worked"
                  value={fmt2(
  computed?.totals.workedHours ?? computed?.totals.workingHours
)}
                />
                <Pill
                  label="Unpaid break"
                  value={fmt2(computed?.totals.breakHours)}
                />
                <Pill label="Paid" value={fmt2(safeTotals.paid)} />
              </div>

              <div className="grid gap-3 sm:grid-cols-4">
                <Pill label="Regular" value={fmt2(safeTotals.regular)} />
                <Pill label="OT Mon–Fri" value={fmt2(safeTotals.otMonFri)} />
                <Pill label="OT Sat" value={fmt2(safeTotals.otSat)} />
                <Pill label="OT Sun/BH" value={fmt2(safeTotals.otSunBh)} />
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <Pill label="Raw total" value={fmt2(safeTotals.hours)} />
                <Pill
  label="OT total"
  value={fmt2(safeTotals.overtimeTotal)}
/>
                <Pill
  label="Overnights"
  value={safeTotals.overnightCount || "0"}
/>

</div>

              {detail.status === "SUBMITTED" ? (
                <div>
                  <div className="text-xs font-semibold text-slate-700">
                    Approval / rejection comment
                  </div>
                  <textarea
                    value={comment}
                    onChange={(event) => setComment(event.target.value)}
                    rows={3}
                    placeholder="Required for rejection; optional for approval…"
                    className="mt-2 w-full rounded-2xl bg-white px-4 py-3 text-base text-slate-900 ring-1 ring-slate-200 outline-none focus:ring-2 focus:ring-cyan-300"
                  />
                  <div className="mt-2 text-[11px] text-slate-500">
                    Break rule: {breakLabel}. Working = Work + Training.
                  </div>
                </div>
              ) : null}

              <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold text-slate-900">
                    Employee week view
                  </div>
                  <div className="text-xs text-slate-500">
                    {detail.entries.length} entry(s)
                  </div>
                </div>

                <div className="mt-3 space-y-3">
                  {groupedByDay.length === 0 ? (
                    <div className="text-sm text-slate-600">No entries.</div>
                  ) : (
                    groupedByDay.map((group) => {
                      const dayComputed =
                        computed?.days?.find(
                          (day) => day.date === group.dayIso,
                        ) ??
                        computeFallback(group.entries).days?.find(
                          (day) => day.date === group.dayIso,
                        );

                      const dayPaid =
                        dayComputed?.paidHours ??
                        group.entries.reduce(
                          (sum, entry) => sum + (Number(entry.hours) || 0),
                          0,
                        );

                      const dayWorked = dayComputed?.workingHours ?? 0;
                      const dayBreak = dayComputed?.breakHours ?? 0;

                      return (
                        <div
                          key={group.dayIso}
                          className="rounded-2xl bg-white p-4 ring-1 ring-slate-200"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="text-sm font-semibold text-slate-900">
                              {dayHeading(group.dayIso)}
                            </div>
                            <div className="text-right">
                              <div className="text-sm font-semibold text-slate-900">
                                {fmt2(dayPaid)}h paid
                              </div>
                              <div className="text-[11px] text-slate-600">
                                Worked {fmt2(dayWorked)}h
                                {dayBreak ? ` • Break ${fmt2(dayBreak)}h` : ""}
                              </div>
                            </div>
                          </div>

                          <div className="mt-3 space-y-3">
                            {group.entries.map((entry) => {
                              const overtime =
                                (Number(entry.otMonFriHours) || 0) +
                                (Number(entry.otSatHours) || 0) +
                                (Number(entry.otSunBhHours) || 0);

                              return (
                                <div
                                  key={entry.id}
                                  className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200"
                                >
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="space-y-1">
                                      <div className="flex items-center gap-2">
                                        <TypeBadge type={entry.type} />
                                        <div className="text-sm font-semibold text-slate-900">
                                          {entryTypeLabel(entry.type)}
                                        </div>
                                      </div>

                                      <div className="text-xs text-slate-700">
                                        <span className="font-semibold">
                                          Job/Site:
                                        </span>{" "}
                                        {jobLabel(entry.job, entry.type)}
                                        <span className="mx-2 text-slate-300">
                                          •
                                        </span>
                                        <span className="font-semibold">
                                          Time:
                                        </span>{" "}
                                        {entry.startTime || "-"}–
                                        {entry.finishTime || "-"}
                                        {entry.overnight ? (
                                          <>
                                            <span className="mx-2 text-slate-300">
                                              •
                                            </span>
                                            <span className="font-semibold text-emerald-700">
                                              Overnight
                                            </span>
                                          </>
                                        ) : null}
                                      </div>

                                      {entry.description ? (
                                        <div className="text-xs text-slate-600">
                                          <span className="font-semibold">
                                            Notes:
                                          </span>{" "}
                                          {entry.description}
                                        </div>
                                      ) : null}
                                    </div>

                                    <div className="text-right">
                                      <Link
                                        href={`/timesheet/entry/${encodeURIComponent(
                                          entry.id,
                                        )}?admin=1&adminWeekId=${encodeURIComponent(
                                          detail.id,
                                        )}`}
                                        className="mb-2 inline-flex rounded-md bg-cyan-600 px-3 py-1 text-xs font-semibold text-white hover:bg-cyan-700"
                                      >
                                        ✏ Edit
                                      </Link>

                                      <div className="text-sm font-semibold text-slate-900">
                                        {fmt2(entry.hours)}h
                                      </div>
                                      {overtime > 0 ? (
                                        <div className="mt-1 text-[11px] font-semibold text-amber-800">
                                          OT {fmt2(overtime)}h
                                        </div>
                                      ) : (
                                        <div className="mt-1 text-[11px] text-slate-500">
                                          —
                                        </div>
                                      )}
                                    </div>
                                  </div>

                                  {isWorkingType(entry.type) ? (
                                    <div className="mt-2 grid gap-2 sm:grid-cols-3">
                                      <div className="rounded-lg bg-white px-3 py-2 text-xs ring-1 ring-slate-200">
                                        <span className="font-semibold">
                                          Regular:
                                        </span>{" "}
                                        {fmt2(entry.regularHours)}
                                      </div>
                                      <div className="rounded-lg bg-white px-3 py-2 text-xs ring-1 ring-slate-200">
                                        <span className="font-semibold">
                                          OT Mon–Fri:
                                        </span>{" "}
                                        {fmt2(entry.otMonFriHours)}
                                      </div>
                                      <div className="rounded-lg bg-white px-3 py-2 text-xs ring-1 ring-slate-200">
                                        <span className="font-semibold">
                                          OT Sat/Sun:
                                        </span>{" "}
                                        {fmt2(
                                          (Number(entry.otSatHours) || 0) +
                                            (Number(entry.otSunBhHours) || 0),
                                        )}
                                      </div>
                                    </div>
                                  ) : null}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {detail.audits && detail.audits.length > 0 ? (
                <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
                  <div className="text-sm font-semibold text-slate-900">
                    Audit history
                  </div>
                  <div className="mt-3 space-y-2">
                    {detail.audits.map((audit) => (
                      <div
                        key={audit.id}
                        className="rounded-xl bg-white p-3 text-xs ring-1 ring-slate-200"
                      >
                        <div className="font-semibold text-slate-900">
                          {audit.action}
                        </div>
                        <div className="mt-1 text-slate-600">
                          {formatDateTime(audit.createdAt)} by{" "}
                          {audit.performedBy?.name?.trim() ||
                            audit.performedBy?.email ||
                            "Unknown user"}
                        </div>
                        {audit.comment ? (
                          <div className="mt-1 text-slate-700">
                            {audit.comment}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

async function readJsonOrText(response: Response) {
  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    return response.json();
  }

  const text = await response.text();
  return { error: text.slice(0, 1200) };
}

function Pill({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl bg-slate-50 px-4 py-3 ring-1 ring-slate-200">
      <div className="text-xs font-semibold text-slate-600">{label}</div>
      <div className="mt-1 text-lg font-semibold text-slate-900">{value}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const normalised = status.toUpperCase();

  const className =
    normalised === "DRAFT"
      ? "bg-yellow-50 text-yellow-800 ring-yellow-200"
      : normalised === "SUBMITTED"
        ? "bg-blue-50 text-blue-800 ring-blue-200"
        : normalised === "APPROVED"
          ? "bg-emerald-50 text-emerald-800 ring-emerald-200"
          : normalised === "REJECTED"
            ? "bg-red-50 text-red-800 ring-red-200"
            : "bg-slate-50 text-slate-700 ring-slate-200";

  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${className}`}
    >
      {normalised}
    </span>
  );
}

function TypeBadge({ type }: { type?: string }) {
  const normalised = (type || "WORK").toUpperCase();
  const base =
    "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1";

  if (normalised === "WORK") {
    return (
      <span className={`${base} bg-cyan-50 text-cyan-800 ring-cyan-200`}>
        WORK
      </span>
    );
  }

  if (normalised.startsWith("HOLIDAY")) {
    return (
      <span className={`${base} bg-purple-50 text-purple-800 ring-purple-200`}>
        HOLIDAY
      </span>
    );
  }

  if (normalised === "SICK") {
    return (
      <span className={`${base} bg-red-50 text-red-800 ring-red-200`}>
        SICK
      </span>
    );
  }

  if (normalised === "TRAINING") {
    return (
      <span className={`${base} bg-amber-50 text-amber-800 ring-amber-200`}>
        TRAINING
      </span>
    );
  }

  return (
    <span className={`${base} bg-slate-50 text-slate-700 ring-slate-200`}>
      {normalised}
    </span>
  );
}

function fmt2(value: number | null | undefined) {
  const numberValue = Number(value ?? 0);
  return Number.isFinite(numberValue) ? numberValue.toFixed(2) : "0.00";
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function startOfWeekMonday(dateInput: Date) {
  const date = new Date(dateInput);
  const day = date.getDay();
  const diff = (day === 0 ? -6 : 1) - day;

  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);

  return date;
}

function weekRangeLabel(weekStartIsoOrDateTime: string) {
  const weekStart = startOfWeekMonday(new Date(weekStartIsoOrDateTime));
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);

  const formatter = (date: Date) =>
    date.toLocaleDateString(undefined, {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });

  return `${formatter(weekStart)} – ${formatter(weekEnd)}`;
}

function dayHeading(dateIso: string) {
  const date = new Date(dateIso);

  return date.toLocaleDateString(undefined, {
    weekday: "long",
    day: "2-digit",
    month: "short",
  });
}

function entryTypeLabel(type?: string) {
  switch ((type || "WORK").toUpperCase()) {
    case "WORK":
      return "Work";
    case "HOLIDAY_FULL":
      return "Holiday (Full)";
    case "HOLIDAY_HALF":
      return "Holiday (Half)";
    case "SICK":
      return "Sick";
    case "TRAINING":
      return "Training";
    default:
      return type || "Work";
  }
}

function jobLabel(job: string, type?: string) {
  const raw = (job || "").trim();

  if (raw) return raw;

  return (type || "WORK").toUpperCase() !== "WORK" ? "(Non-work)" : "(No job)";
}

function isWorkingType(type?: string) {
  return WORKING_TYPES.has((type || "WORK").toUpperCase());
}

function computeFallback(entries: Entry[]): WeekComputed {
  const byDay = new Map<string, Entry[]>();

  for (const entry of entries) {
    const key = isoDate(new Date(entry.date));
    byDay.set(key, [...(byDay.get(key) ?? []), entry]);
  }

  const days = Array.from(byDay.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, list]) => {
      const workingHours = list
        .filter((entry) => isWorkingType(entry.type))
        .reduce((sum, entry) => sum + (Number(entry.hours) || 0), 0);

      const breakHours =
        workingHours >= BREAK_THRESHOLD_HOURS ? BREAK_HOURS : 0;

      const paidHours = Math.max(0, workingHours - breakHours);

      return {
        date,
        workingHours: round2(workingHours),
        breakHours: round2(breakHours),
        paidHours: round2(paidHours),
      };
    });

  const totals = days.reduce(
    (acc, day) => {
      acc.workingHours += day.workingHours;
      acc.breakHours += day.breakHours;
      acc.paidHours += day.paidHours;
      return acc;
    },
    {
      workingHours: 0,
      breakHours: 0,
      paidHours: 0,
    },
  );

  return {
    days,
    totals: {
      workingHours: round2(totals.workingHours),
      breakHours: round2(totals.breakHours),
      paidHours: round2(totals.paidHours),
    },
    rules: {
      workingTypes: Array.from(WORKING_TYPES),
      breakThresholdHours: BREAK_THRESHOLD_HOURS,
      breakHours: BREAK_HOURS,
      unpaid: true,
    },
  };
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString(undefined, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
