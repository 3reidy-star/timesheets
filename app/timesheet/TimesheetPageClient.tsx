"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type Entry = {
  id: string;
  date: string;
  type?: string;
  job: string;

  hours: number;
  startTime: string;
  finishTime: string;

  regularHours: number;
  otMonFriHours: number;
  otSatHours: number;
  otSunBhHours: number;

  overnight: boolean;
  leftEarlyByChoice?: boolean;
  agreedRate: number | null;
  description?: string | null;
};

type Week = {
  id: string;
  weekStart: string;
  status: "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED";
  entries: Entry[];
};

type ComputedDay = {
  date: string;
  workedHours: number;
  breakHours: number;
  corePaidHours: number;
  paidHours: number;
  regularHours: number;
  otMonFriHours: number;
  otSatHours: number;
  otSunBhHours: number;
  overnightCount: number;
  overnightAllowance: number;
  leftEarlyByChoice?: boolean;
};

type ComputedTotals = {
  workedHours: number;
  breakHours: number;
  corePaidHours: number;
  businessTopUpHours: number;
  paidHours: number;
  regularHours: number;
  otMonFriHours: number;
  otSatHours: number;
  otSunBhHours: number;
  overtimeTotal: number;
  overnightCount: number;
  overnightAllowance: number;
  hasAnyLeftEarlyByChoice?: boolean;
};

type ComputedWeek = {
  days: ComputedDay[];
  totals: ComputedTotals;
  rules?: {
    weeklyCorePaidHours?: number;
    businessTopUpHours?: number;
    monThu?: { coreWindow: string; corePaidHours: number };
    fri?: { coreWindow: string; corePaidHours: number };
    unpaidBreakHours?: number;
    workingTypes?: string[];
    leftEarlyByChoice?: string;
  };
};

type WeekApiResponse = {
  week: Week;
  computed?: ComputedWeek;
  user: { id: string; name: string | null; email: string };
};

function StatPill({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl bg-slate-50 px-4 py-3 ring-1 ring-slate-200">
      <div className="text-xs font-semibold text-slate-600">{label}</div>
      <div className="mt-1 text-lg font-semibold text-slate-900">{value}</div>
    </div>
  );
}

async function readJsonOrText(r: Response) {
  const ct = r.headers.get("content-type") || "";
  if (ct.includes("application/json")) return r.json();
  const t = await r.text();
  return { error: t.slice(0, 1200) };
}

function fmt2(n: number | null | undefined) {
  const v = Number(n ?? 0);
  return Number.isFinite(v) ? v.toFixed(2) : "0.00";
}

function fmtGBP(n: number | null | undefined) {
  const v = Number(n ?? 0);
  return Number.isFinite(v) ? `£${v.toFixed(2)}` : "£0.00";
}

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function dateKey(value: string | Date) {
  if (typeof value === "string") return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

function startOfWeekMonday(d: Date) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function addDays(d: Date, days: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

function addWeeksIso(weekStartIso: string, weeks: number) {
  const d = new Date(weekStartIso);
  if (Number.isNaN(d.getTime())) return weekStartIso;
  d.setDate(d.getDate() + weeks * 7);
  return isoDate(startOfWeekMonday(d));
}

function shortDate(dateIso: string) {
  const d = new Date(dateIso);
  return d.toLocaleDateString(undefined, { day: "2-digit", month: "2-digit", year: "numeric" });
}

function dayShort(dateIso: string) {
  return new Date(dateIso).toLocaleDateString(undefined, { weekday: "short" });
}

function dayLong(dateIso: string) {
  return new Date(dateIso).toLocaleDateString(undefined, { weekday: "long" });
}

function parseWeekStartFromQuery(qsValue: string | null) {
  if (!qsValue) return null;
  const d = new Date(qsValue);
  if (Number.isNaN(d.getTime())) return null;
  return isoDate(startOfWeekMonday(d));
}

function entryTypeLabel(t?: string) {
  switch ((t || "WORK").toUpperCase()) {
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
      return t || "Work";
  }
}

function TypeBadge({ type }: { type?: string }) {
  const t = (type || "WORK").toUpperCase();
  const base = "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1";
  if (t === "WORK") return <span className={`${base} bg-cyan-50 text-cyan-800 ring-cyan-200`}>WORK</span>;
  if (t.startsWith("HOLIDAY"))
    return <span className={`${base} bg-purple-50 text-purple-800 ring-purple-200`}>HOLIDAY</span>;
  if (t === "SICK") return <span className={`${base} bg-red-50 text-red-800 ring-red-200`}>SICK</span>;
  if (t === "TRAINING")
    return <span className={`${base} bg-amber-50 text-amber-800 ring-amber-200`}>TRAINING</span>;
  return <span className={`${base} bg-slate-50 text-slate-700 ring-slate-200`}>{t}</span>;
}

function jobLabel(e: Entry) {
  const raw = (e.job || "").trim();
  if (raw) return raw;
  return e.type && e.type !== "WORK" ? "(Non-work)" : "(No job)";
}

export default function TimesheetPage() {
  const router = useRouter();
  const sp = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [week, setWeek] = useState<Week | null>(null);
  const [computed, setComputed] = useState<ComputedWeek | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [weekStartIso, setWeekStartIso] = useState(() => {
    const initial = parseWeekStartFromQuery(sp.get("weekStart"));
    return initial ?? isoDate(startOfWeekMonday(new Date()));
  });

  useEffect(() => {
    const fromUrl = parseWeekStartFromQuery(sp.get("weekStart"));
    if (fromUrl && fromUrl !== weekStartIso) setWeekStartIso(fromUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sp]);

  useEffect(() => {
    const current = sp.get("weekStart");
    if (current !== weekStartIso) {
      router.replace(`/timesheet?weekStart=${encodeURIComponent(weekStartIso)}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStartIso]);

  async function loadWeek() {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch(`/api/week?weekStart=${weekStartIso}`, { cache: "no-store" });
      const data = (await readJsonOrText(r)) as WeekApiResponse | { error: string };
      if (!r.ok) throw new Error((data as any)?.error ?? "Failed to load week");

      const payload = data as WeekApiResponse;
      setWeek(payload.week);
      setComputed(payload.computed ?? null);
    } catch (e: any) {
      setWeek(null);
      setComputed(null);
      setErr(e?.message ?? "Failed to load week");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadWeek();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStartIso]);

  const days = useMemo(() => {
    const ws = week?.weekStart ? startOfWeekMonday(new Date(week.weekStart)) : startOfWeekMonday(new Date(weekStartIso));
    return Array.from({ length: 7 }).map((_, i) => {
      const d = addDays(ws, i);
      return { iso: dateKey(d) };
    });
  }, [week?.weekStart, weekStartIso]);

  const computedDayMap = useMemo(() => {
    const map = new Map<string, ComputedDay>();
    for (const d of computed?.days ?? []) map.set(d.date, d);
    return map;
  }, [computed]);

  const totals = useMemo<ComputedTotals>(() => {
    return (
      computed?.totals ?? {
        workedHours: 0,
        breakHours: 0,
        corePaidHours: 37,
        businessTopUpHours: 0.5,
        paidHours: 37.5,
        regularHours: 37,
        otMonFriHours: 0,
        otSatHours: 0,
        otSunBhHours: 0,
        overtimeTotal: 0,
        overnightCount: 0,
        overnightAllowance: 0,
        hasAnyLeftEarlyByChoice: false,
      }
    );
  }, [computed]);

  const entriesByJob = useMemo(() => {
    const map = new Map<string, Entry[]>();
    for (const e of week?.entries ?? []) {
      const key = jobLabel(e);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    for (const [k, list] of map) {
      list.sort(
        (a, b) =>
          new Date(a.date).getTime() - new Date(b.date).getTime() ||
          (a.startTime || "").localeCompare(b.startTime || "")
      );
      map.set(k, list);
    }
    return map;
  }, [week]);

  const jobRows = useMemo(() => Array.from(entriesByJob.keys()).sort((a, b) => a.localeCompare(b)), [entriesByJob]);

  function cellForJob(jobName: string, dayIso: string) {
    const list = entriesByJob.get(jobName) ?? [];
    const sameDay = list.filter((e) => dateKey(e.date) === dayIso);
    if (sameDay.length === 0) return null;

    const total = sameDay.reduce((acc, e) => acc + (Number(e.hours) || 0), 0);
    const overnightCount = sameDay.reduce((acc, e) => acc + (e.overnight ? 1 : 0), 0);

    return {
      total,
      overnightCount,
      overnightAllowance: overnightCount * 35,
    };
  }

  const entriesByDay = useMemo(() => {
    const map = new Map<string, Entry[]>();
    for (const e of week?.entries ?? []) {
      const dIso = dateKey(e.date);
      if (!map.has(dIso)) map.set(dIso, []);
      map.get(dIso)!.push(e);
    }
    for (const [k, list] of map) {
      list.sort((a, b) => jobLabel(a).localeCompare(jobLabel(b)) || (a.startTime || "").localeCompare(b.startTime || ""));
      map.set(k, list);
    }
    return map;
  }, [week]);

  const rangeLabel = useMemo(() => {
    const start = days[0]?.iso;
    const end = days[6]?.iso;
    if (!start || !end) return "";
    return `${shortDate(start)} – ${shortDate(end)}`;
  }, [days]);

  const isDraft = week?.status === "DRAFT";
  const canSubmitWeek = isDraft && (week?.entries?.length ?? 0) > 0 && !loading && !submitting;

  async function submitWeek() {
    if (!week || !canSubmitWeek) return;
    setErr(null);
    setSubmitting(true);
    try {
      const r = await fetch("/api/week/submit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ weekId: week.id }),
      });
      const data = await readJsonOrText(r);
      if (!r.ok) throw new Error((data as any)?.error ?? "Failed to submit week");
      setWeek((prev) => (prev ? { ...prev, status: "SUBMITTED" } : prev));
      await loadWeek();
    } catch (e: any) {
      setErr(e?.message ?? "Failed to submit week");
    } finally {
      setSubmitting(false);
    }
  }

  const helpText = useMemo(() => {
    if (totals.hasAnyLeftEarlyByChoice) {
      return "* Payroll includes at least one left-early-by-choice entry, so those days are paid from actual stored regular/overtime hours with no business top-up.";
    }
    const core = computed?.rules?.weeklyCorePaidHours ?? 37;
    const topUp = computed?.rules?.businessTopUpHours ?? 0.5;
    return `* Payroll = core paid hours (${fmt2(core)}) + business top-up (${fmt2(topUp)}) + overtime. Job rows show actual entered hours only.`;
  }, [computed, totals.hasAnyLeftEarlyByChoice]);

  return (
    <>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Weekly timesheet</h1>
          <div className="mt-1 text-sm text-slate-600">
            Status: <span className="font-semibold text-slate-900">{week?.status ?? "—"}</span>
          </div>

          <div className="mt-3 flex flex-wrap items-end gap-2">
            <div>
              <div className="text-xs font-semibold text-slate-600">Week starting (Mon)</div>
              <input
                type="date"
                value={weekStartIso}
                onChange={(e) => {
                  const picked = new Date(e.target.value);
                  setWeekStartIso(isoDate(startOfWeekMonday(picked)));
                }}
                className="mt-1 rounded-xl bg-white px-3 py-2 text-sm text-slate-900 ring-1 ring-slate-200 outline-none focus:ring-2 focus:ring-cyan-300"
              />
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setWeekStartIso((prev) => addWeeksIso(prev, -1))}
                className="mt-5 inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50"
              >
                ← Prev week
              </button>

              <button
                type="button"
                onClick={() => setWeekStartIso((prev) => addWeeksIso(prev, 1))}
                className="mt-5 inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50"
              >
                Next week →
              </button>

              <button
                type="button"
                onClick={() => setWeekStartIso(isoDate(startOfWeekMonday(new Date())))}
                className="mt-5 inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50"
              >
                Today
              </button>
            </div>

            <div className="mt-5 text-xs text-slate-500">{rangeLabel}</div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <StatPill label="Worked Hrs" value={fmt2(totals.workedHours)} />
          <StatPill label="Core Paid" value={fmt2(totals.corePaidHours)} />
          <StatPill label="Business Top-Up" value={fmt2(totals.businessTopUpHours)} />
          <StatPill label="OT Mon–Fri" value={fmt2(totals.otMonFriHours)} />
          <StatPill label="OT Sat" value={fmt2(totals.otSatHours)} />
          <StatPill label="OT Sun/BH" value={fmt2(totals.otSunBhHours)} />
          <StatPill label="Total OT" value={fmt2(totals.overtimeTotal)} />
          <StatPill label="Total Paid" value={fmt2(totals.paidHours)} />
          <StatPill label="Overnights" value={totals.overnightCount} />
          <StatPill label="Overnight allowance" value={fmtGBP(totals.overnightAllowance)} />

          {isDraft ? (
            <Link
              href={`/timesheet/entry?weekStart=${encodeURIComponent(weekStartIso)}`}
              className="ml-0 sm:ml-2 inline-flex items-center justify-center rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-900 shadow-sm hover:bg-cyan-400"
            >
              + Add entry
            </Link>
          ) : (
            <span className="ml-0 sm:ml-2 inline-flex items-center justify-center rounded-xl bg-slate-200 px-4 py-2 text-sm font-semibold text-slate-500 cursor-not-allowed">
              Week locked
            </span>
          )}

          {isDraft ? (
            <button
              type="button"
              onClick={submitWeek}
              disabled={!canSubmitWeek}
              className="inline-flex items-center justify-center rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-50"
            >
              {submitting ? "Submitting…" : "Submit week"}
            </button>
          ) : (
            <div className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700">
              Submitted ✓
            </div>
          )}
        </div>
      </div>

      {err ? (
        <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{err}</div>
      ) : null}

      <div className="mt-6 hidden overflow-auto rounded-3xl bg-white ring-1 ring-slate-200 shadow-sm md:block">
        <table className="min-w-[1100px] w-full border-collapse">
          <thead>
            <tr className="bg-slate-50">
              <th className="px-3 py-3 text-left text-xs font-semibold text-slate-600 ring-1 ring-slate-200">
                Job / Site
              </th>
              {days.map((d) => (
                <th
                  key={d.iso}
                  className="px-3 py-3 text-center text-xs font-semibold text-slate-600 ring-1 ring-slate-200"
                >
                  <div className="text-slate-800">{dayShort(d.iso)}</div>
                  <div className="text-[11px] text-slate-500">{shortDate(d.iso)}</div>
                </th>
              ))}
              <th className="px-3 py-3 text-center text-xs font-semibold text-slate-600 ring-1 ring-slate-200">
                Week total
              </th>
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td colSpan={9} className="px-3 py-4 text-sm text-slate-600 ring-1 ring-slate-200">
                  Loading…
                </td>
              </tr>
            ) : !week ? (
              <tr>
                <td colSpan={9} className="px-3 py-4 text-sm text-slate-600 ring-1 ring-slate-200">
                  No week loaded.
                </td>
              </tr>
            ) : jobRows.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-3 py-4 text-sm text-slate-600 ring-1 ring-slate-200">
                  No entries yet.
                </td>
              </tr>
            ) : (
              jobRows.map((jobName) => {
                let rowTotal = 0;
                return (
                  <tr key={jobName} className="odd:bg-white even:bg-slate-50/40 hover:bg-slate-50">
                    <td className="px-3 py-3 text-sm font-semibold text-slate-900 ring-1 ring-slate-200">
                      {jobName}
                    </td>

                    {days.map((d) => {
                      const cell = cellForJob(jobName, d.iso);
                      rowTotal += cell?.total ?? 0;
                      return (
                        <td key={d.iso} className="px-3 py-3 text-center text-sm text-slate-900 ring-1 ring-slate-200">
                          {cell ? (
                            <div className="flex flex-col items-center gap-0.5">
                              <div className="text-sm font-semibold">{fmt2(cell.total)}</div>
                              <div className="text-[11px] text-slate-600">
                                {cell.overnightCount
                                  ? `ON ${cell.overnightCount} (+£${cell.overnightAllowance.toFixed(0)})`
                                  : ""}
                              </div>
                            </div>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                      );
                    })}

                    <td className="px-3 py-3 text-center text-sm font-semibold text-slate-900 ring-1 ring-slate-200">
                      {fmt2(rowTotal)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>

          {!loading && week ? (
            <tfoot>
              <tr className="bg-slate-50">
                <td className="px-3 py-3 text-sm font-semibold text-slate-800 ring-1 ring-slate-200">Payroll day view</td>
                {days.map((d) => {
                  const day = computedDayMap.get(d.iso);
                  return (
                    <td key={d.iso} className="px-3 py-3 text-center text-sm ring-1 ring-slate-200">
                      <div className="font-semibold">{fmt2(day?.paidHours)}</div>
                      <div className="text-[11px] text-slate-600">
                        {day ? (
                          day.leftEarlyByChoice ? (
                            <>
                              {`Regular ${fmt2(day.regularHours)}`}
                              {day.otMonFriHours > 0 ? ` • OT ${fmt2(day.otMonFriHours)}` : ""}
                              {day.otSatHours > 0 ? ` • Sat OT ${fmt2(day.otSatHours)}` : ""}
                              {day.otSunBhHours > 0 ? ` • Sun/BH OT ${fmt2(day.otSunBhHours)}` : ""}
                            </>
                          ) : (
                            <>
                              {`Core ${fmt2(day.corePaidHours)}`}
                              {day.otMonFriHours > 0 ? ` • OT ${fmt2(day.otMonFriHours)}` : ""}
                              {day.otSatHours > 0 ? ` • Sat OT ${fmt2(day.otSatHours)}` : ""}
                              {day.otSunBhHours > 0 ? ` • Sun/BH OT ${fmt2(day.otSunBhHours)}` : ""}
                            </>
                          )
                        ) : (
                          ""
                        )}
                      </div>
                    </td>
                  );
                })}
                <td className="px-3 py-3 text-center text-sm font-semibold text-slate-900 ring-1 ring-slate-200">
                  <div>{fmt2(totals.paidHours)}</div>
                  <div className="text-[11px] text-slate-600">
                    {totals.businessTopUpHours > 0
                      ? `Includes +${fmt2(totals.businessTopUpHours)} business top-up`
                      : "No business top-up"}
                  </div>
                </td>
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>

      <section className="mt-6 rounded-3xl bg-white p-6 ring-1 ring-slate-200 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Entries (detailed)</h2>
            <p className="mt-1 text-sm text-slate-600">Use Edit if you need to correct anything before submission.</p>
          </div>
          <div className="text-xs text-slate-500">{week?.entries?.length ?? 0} entry(s)</div>
        </div>

        {loading ? (
          <div className="mt-4 text-sm text-slate-600">Loading…</div>
        ) : !week ? (
          <div className="mt-4 text-sm text-slate-600">No week loaded.</div>
        ) : (week.entries?.length ?? 0) === 0 ? (
          <div className="mt-4 text-sm text-slate-600">No entries yet.</div>
        ) : (
          <div className="mt-4 space-y-4">
            {days.map((d) => {
              const list = entriesByDay.get(d.iso) ?? [];
              if (list.length === 0) return null;

              const day = computedDayMap.get(d.iso);

              return (
                <div key={d.iso} className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
                  <div className="flex items-start justify-between gap-3">
                    <div className="text-sm font-semibold text-slate-900">
                      {dayLong(d.iso)} <span className="ml-2 text-xs text-slate-500">{shortDate(d.iso)}</span>
                    </div>

                    <div className="text-right">
                      <div className="text-sm font-semibold text-slate-900">{fmt2(day?.paidHours)}h paid</div>
                      <div className="text-[11px] text-slate-600">
                        Worked {fmt2(day?.workedHours)}
                        {day
                          ? day.leftEarlyByChoice
                            ? ` • Regular ${fmt2(day.regularHours)}`
                            : ` • Core ${fmt2(day.corePaidHours)}`
                          : ""}
                        {day && day.otMonFriHours > 0 ? ` • OT ${fmt2(day.otMonFriHours)}` : ""}
                        {day && day.otSatHours > 0 ? ` • Sat OT ${fmt2(day.otSatHours)}` : ""}
                        {day && day.otSunBhHours > 0 ? ` • Sun/BH OT ${fmt2(day.otSunBhHours)}` : ""}
                      </div>
                      {day?.leftEarlyByChoice ? (
                        <div className="text-[11px] font-semibold text-amber-700">
                          Left early by choice
                        </div>
                      ) : null}
                      {day && day.overnightCount > 0 ? (
                        <div className="text-[11px] text-emerald-700 font-semibold">
                          Overnight +{fmtGBP(day.overnightAllowance)}
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-3 space-y-2">
                    {list.map((e) => {
                      const otStored =
                        (Number(e.otMonFriHours) || 0) +
                        (Number(e.otSatHours) || 0) +
                        (Number(e.otSunBhHours) || 0);

                      return (
                        <div key={e.id} className="rounded-xl bg-white p-3 ring-1 ring-slate-200">
                          <div className="flex items-start justify-between gap-3">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <TypeBadge type={e.type} />
                                <div className="text-sm font-semibold text-slate-900">{entryTypeLabel(e.type)}</div>
                              </div>

                              <div className="text-xs text-slate-700">
                                <span className="font-semibold">Job/Site:</span> {jobLabel(e)}
                                {e.type && e.type !== "WORK" ? (
                                  <span className="ml-2 text-slate-500">(Non-work)</span>
                                ) : null}
                              </div>

                              <div className="text-xs text-slate-700">
                                <span className="font-semibold">Time:</span> {e.startTime}–{e.finishTime}
                                {e.overnight ? (
                                  <span className="ml-2 font-semibold text-emerald-700">+£35 Overnight</span>
                                ) : null}
                              </div>

                              {e.leftEarlyByChoice ? (
                                <div className="text-xs font-semibold text-amber-700">
                                  Employee requested to finish early
                                </div>
                              ) : null}

                              {e.description ? (
                                <div className="text-xs text-slate-600">
                                  <span className="font-semibold">Notes:</span> {e.description}
                                </div>
                              ) : null}
                            </div>

                            <div className="text-right space-y-2">
                              <div>
                                <div className="text-sm font-semibold text-slate-900">{fmt2(e.hours)}h</div>
                                <div className="mt-0.5 text-[11px] text-slate-600">
                                  Stored Reg {fmt2(e.regularHours)}
                                  {otStored > 0 ? ` • Stored OT ${fmt2(otStored)}` : ""}
                                </div>
                              </div>

                              {isDraft ? (
                                <Link
                                  href={`/timesheet/entry/${encodeURIComponent(e.id)}`}
                                  className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-900 hover:bg-slate-50"
                                >
                                  Edit
                                </Link>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <div className="mt-6 space-y-4 md:hidden">
        {loading ? (
          <div className="rounded-3xl bg-white p-4 ring-1 ring-slate-200 text-slate-600 shadow-sm">Loading…</div>
        ) : !week ? (
          <div className="rounded-3xl bg-white p-4 ring-1 ring-slate-200 text-slate-600 shadow-sm">No week loaded.</div>
        ) : (
          days.map((d) => {
            const list = entriesByDay.get(d.iso) ?? [];
            const day = computedDayMap.get(d.iso);

            return (
              <div key={d.iso} className="rounded-3xl bg-white p-4 ring-1 ring-slate-200 shadow-sm">
                <div className="flex items-end justify-between">
                  <div className="text-sm font-semibold text-slate-900">{dayLong(d.iso)}</div>
                  <div className="text-xs text-slate-500">{shortDate(d.iso)}</div>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-3">
                  <StatPill label="Worked" value={fmt2(day?.workedHours)} />
                  <StatPill
                    label={day?.leftEarlyByChoice ? "Regular" : "Core Paid"}
                    value={fmt2(day?.leftEarlyByChoice ? day?.regularHours : day?.corePaidHours)}
                  />
                  <StatPill label="Paid" value={fmt2(day?.paidHours)} />
                  <StatPill label="OT Mon–Fri" value={fmt2(day?.otMonFriHours)} />
                  <StatPill label="OT Sat/Sun" value={fmt2((day?.otSatHours ?? 0) + (day?.otSunBhHours ?? 0))} />
                  <StatPill
                    label="Overnight"
                    value={day?.overnightCount ? `${day.overnightCount} (${fmtGBP(day.overnightAllowance)})` : "0"}
                  />
                </div>

                {day?.leftEarlyByChoice ? (
                  <div className="mt-3 text-xs font-semibold text-amber-700">
                    Left early by choice
                  </div>
                ) : null}

                {list.length === 0 ? (
                  <div className="mt-3 text-sm text-slate-600">No entries.</div>
                ) : (
                  <div className="mt-3 space-y-2">
                    {list.map((e) => {
                      const otStored =
                        (Number(e.otMonFriHours) || 0) +
                        (Number(e.otSatHours) || 0) +
                        (Number(e.otSunBhHours) || 0);

                      return (
                        <div key={e.id} className="rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="flex items-center gap-2">
                                <TypeBadge type={e.type} />
                                <div className="text-sm font-semibold text-slate-900">{jobLabel(e)}</div>
                              </div>

                              <div className="mt-1 text-xs text-slate-600">
                                {e.startTime}–{e.finishTime} • Total {fmt2(e.hours)} • Stored Reg {fmt2(e.regularHours)}
                              </div>

                              <div className="mt-1 text-xs text-slate-600">
                                Stored OT: {fmt2(otStored)}
                                {e.overnight ? " • +£35 Overnight" : ""}
                              </div>

                              {e.leftEarlyByChoice ? (
                                <div className="mt-1 text-xs font-semibold text-amber-700">
                                  Employee requested to finish early
                                </div>
                              ) : null}

                              {e.description ? (
                                <div className="mt-1 text-xs text-slate-600">
                                  <span className="font-semibold">Notes:</span> {e.description}
                                </div>
                              ) : null}
                            </div>

                            {isDraft ? (
                              <Link
                                href={`/timesheet/entry/${encodeURIComponent(e.id)}`}
                                className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-900 hover:bg-slate-50"
                              >
                                Edit
                              </Link>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      <div className="mt-6 text-xs text-slate-500">{helpText}</div>
    </>
  );
}