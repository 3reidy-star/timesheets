"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type SubmittedWeek = {
  id: string;
  weekStart: string;
  status: string; // "SUBMITTED"
  // legacy (kept by API)
  totalHours: number;

  // new (from updated /api/weeks/submitted)
  workingHours?: number;
  breakHours?: number;
  paidHours?: number;

  user: { id: string; name: string | null; email: string };
};

type Entry = {
  id: string;
  date: string; // ISO datetime
  type?: string; // EntryType
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

type WeekComputed = {
  days: { date: string; workingHours: number; breakHours: number; paidHours: number }[];
  totals: { workingHours: number; breakHours: number; paidHours: number };
  rules?: {
    workingTypes?: string[];
    breakThresholdHours?: number;
    breakHours?: number;
    unpaid?: boolean;
  };
};

type WeekDetail = {
  id: string;
  weekStart: string;
  status: string;
  user: { id: string; name: string | null; email: string };
  entries: Entry[];
  totals: { hours: number; regular: number; otMonFri: number; otSat: number; otSunBh: number };
  computed?: WeekComputed;
};

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

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function startOfWeekMonday(d: Date) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function weekRangeLabel(weekStartIsoOrDateTime: string) {
  const ws = startOfWeekMonday(new Date(weekStartIsoOrDateTime));
  const we = new Date(ws);
  we.setDate(we.getDate() + 6);

  const fmt = (d: Date) =>
    d.toLocaleDateString(undefined, { day: "2-digit", month: "2-digit", year: "numeric" });

  return `${fmt(ws)} – ${fmt(we)}`;
}

function Pill({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl bg-slate-50 px-4 py-3 ring-1 ring-slate-200">
      <div className="text-xs font-semibold text-slate-600">{label}</div>
      <div className="mt-1 text-lg font-semibold text-slate-900">{value}</div>
    </div>
  );
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

function dayHeading(dateIso: string) {
  const d = new Date(dateIso);
  return d.toLocaleDateString(undefined, { weekday: "long", day: "2-digit", month: "short" });
}

function jobLabel(job: string, type?: string) {
  const raw = (job || "").trim();
  if (raw) return raw;
  return (type || "WORK").toUpperCase() !== "WORK" ? "(Non-work)" : "(No job)";
}

// Client-side fallback (in case computed isn't present for some reason)
const WORKING_TYPES = new Set(["WORK", "TRAINING"]);
const BREAK_THRESHOLD_HOURS = 8;
const BREAK_HOURS = 0.5;

function isWorkingType(t?: string) {
  return WORKING_TYPES.has((t || "WORK").toUpperCase());
}

function computeFallback(entries: Entry[]): WeekComputed {
  const byDay = new Map<string, Entry[]>();
  for (const e of entries) {
    const k = isoDate(new Date(e.date));
    byDay.set(k, [...(byDay.get(k) ?? []), e]);
  }

  const days = [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, list]) => {
      const workingHours = list.filter((e) => isWorkingType(e.type)).reduce((s, e) => s + (Number(e.hours) || 0), 0);
      const breakHours = workingHours >= BREAK_THRESHOLD_HOURS ? BREAK_HOURS : 0;
      const paidHours = Math.max(0, workingHours - breakHours);
      return {
        date,
        workingHours: round2(workingHours),
        breakHours: round2(breakHours),
        paidHours: round2(paidHours),
      };
    });

  const totals = days.reduce(
    (acc, d) => {
      acc.workingHours += d.workingHours;
      acc.breakHours += d.breakHours;
      acc.paidHours += d.paidHours;
      return acc;
    },
    { workingHours: 0, breakHours: 0, paidHours: 0 }
  );

  return {
    days,
    totals: {
      workingHours: round2(totals.workingHours),
      breakHours: round2(totals.breakHours),
      paidHours: round2(totals.paidHours),
    },
    rules: { breakThresholdHours: BREAK_THRESHOLD_HOURS, breakHours: BREAK_HOURS, unpaid: true },
  };
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export default function ApprovalsPage() {
  const [loading, setLoading] = useState(true);
  const [weeks, setWeeks] = useState<SubmittedWeek[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = useMemo(() => weeks.find((w) => w.id === selectedId) ?? null, [weeks, selectedId]);

  const [acting, setActing] = useState<null | "APPROVE" | "REJECT">(null);

  const [detailLoading, setDetailLoading] = useState(false);
  const [detail, setDetail] = useState<WeekDetail | null>(null);

  const [comment, setComment] = useState("");

  async function loadQueue() {
    setLoading(true);
    setErr(null);

    try {
      const r = await fetch("/api/weeks/submitted", { cache: "no-store" });
      const data = await readJsonOrText(r);
      if (!r.ok) throw new Error((data as any)?.error ?? "Failed to load submitted weeks");

      const list = ((data as any)?.weeks ?? []) as SubmittedWeek[];
      setWeeks(list);

      if (!list.length) setSelectedId(null);
      else if (!selectedId || !list.some((w) => w.id === selectedId)) setSelectedId(list[0].id);
    } catch (e: any) {
      setWeeks([]);
      setSelectedId(null);
      setErr(e?.message ?? "Failed to load approvals");
    } finally {
      setLoading(false);
    }
  }

  async function loadDetail(weekId: string) {
    setDetailLoading(true);
    setDetail(null);
    try {
      const r = await fetch(`/api/week/detail?weekId=${encodeURIComponent(weekId)}`, { cache: "no-store" });
      const data = await readJsonOrText(r);
      if (!r.ok) throw new Error((data as any)?.error ?? "Failed to load week detail");
      setDetail((data as any)?.week as WeekDetail);
    } catch (e: any) {
      setDetail(null);
      setErr(e?.message ?? "Failed to load week detail");
    } finally {
      setDetailLoading(false);
    }
  }

  useEffect(() => {
    loadQueue();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    loadDetail(selectedId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  async function review(action: "APPROVE" | "REJECT") {
    if (!selected) return;

    setErr(null);
    setActing(action);

    try {
      const r = await fetch("/api/week/review", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          weekId: selected.id,
          action,
          comment: comment.trim() || null,
        }),
      });

      const data = await readJsonOrText(r);
      if (!r.ok) throw new Error((data as any)?.error ?? "Failed to review week");

      setComment("");
      await loadQueue();
      // if it was approved/rejected it'll disappear from queue; detail refresh harmless either way
      await loadDetail(selected.id);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to review week");
    } finally {
      setActing(null);
    }
  }

  const computed = useMemo<WeekComputed | null>(() => {
    if (!detail) return null;
    return detail.computed ?? computeFallback(detail.entries ?? []);
  }, [detail]);

  const groupedByDay = useMemo(() => {
    const entries = detail?.entries ?? [];
    const map = new Map<string, Entry[]>();

    for (const e of entries) {
      const key = isoDate(new Date(e.date));
      map.set(key, [...(map.get(key) ?? []), e]);
    }

    const keys = Array.from(map.keys()).sort();
    return keys.map((k) => ({
      dayIso: k,
      entries: (map.get(k) ?? [])
        .slice()
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
    }));
  }, [detail]);

  const exceptions = useMemo(() => {
    const entries = detail?.entries ?? [];
    const overnightCount = entries.filter((e) => !!e.overnight).length;
    const otTotal = entries.reduce(
      (s, e) =>
        s +
        (Number(e.otMonFriHours) || 0) +
        (Number(e.otSatHours) || 0) +
        (Number(e.otSunBhHours) || 0),
      0
    );
    return { overnightCount, otTotal: round2(otTotal) };
  }, [detail]);

  const breakLabel = computed?.rules?.breakThresholdHours
    ? `0.5h deducted when daily working ≥ ${computed.rules.breakThresholdHours}h`
    : "0.5h deducted when daily working ≥ 8h";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Approvals</h1>
          <p className="mt-1 text-sm text-slate-600">Manager queue for submitted weekly timesheets.</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={loadQueue}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50 active:opacity-90"
          >
            Refresh
          </button>

          <Link
            href="/timesheet"
            className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-cyan-400 active:opacity-90"
          >
            Open weekly timesheet →
          </Link>

          <Link
            href="/approvals/rejected"
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50 active:opacity-90"
          >
            Sent back
          </Link>
        </div>
      </div>

      {err ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{err}</div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Queue */}
        <section className="rounded-3xl bg-white p-6 ring-1 ring-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-slate-900">Submitted queue</div>
            <div className="text-xs text-slate-500">{loading ? "Loading…" : `${weeks.length} week(s)`}</div>
          </div>

          <div className="mt-4 space-y-3">
            {loading ? (
              <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200 text-slate-600">Loading…</div>
            ) : weeks.length === 0 ? (
              <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200 text-slate-600">No submitted weeks.</div>
            ) : (
              weeks.map((w) => {
                const active = w.id === selectedId;
                const who = w.user.name?.trim() || w.user.email;

                const paid = w.paidHours ?? null;
                const brk = w.breakHours ?? null;
                const working = w.workingHours ?? null;

                return (
                  <button
                    key={w.id}
                    onClick={() => setSelectedId(w.id)}
                    className={
                      active
                        ? "w-full rounded-2xl bg-cyan-50 p-4 text-left ring-2 ring-cyan-300"
                        : "w-full rounded-2xl bg-white p-4 text-left ring-1 ring-slate-200 hover:bg-slate-50"
                    }
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-slate-900">{who}</div>
                        <div className="mt-1 text-xs text-slate-600">{weekRangeLabel(w.weekStart)}</div>
                        <div className="mt-1 text-xs text-slate-500">WeekStart: {isoDate(new Date(w.weekStart))}</div>
                      </div>

                      <div className="text-right">
                        <div className="text-sm font-semibold text-slate-900">
                          {paid !== null ? `${fmt2(paid)} paid` : `${fmt2(w.totalHours)} hrs`}
                        </div>
                        <div className="mt-0.5 text-[11px] text-slate-600">
                          {paid !== null && working !== null ? `Worked ${fmt2(working)} • ` : ""}
                          {paid !== null && brk !== null ? `Break ${fmt2(brk)}` : ""}
                        </div>
                        <div className="mt-1 inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 ring-1 ring-amber-200">
                          SUBMITTED
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          <div className="mt-4 text-xs text-slate-500">* Paid hours include the unpaid break deduction ({breakLabel}).</div>
        </section>

        {/* Detail */}
        <section className="rounded-3xl bg-white p-6 ring-1 ring-slate-200 shadow-sm">
          {!selected ? (
            <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200 text-slate-600">
              Select a submitted week to review.
            </div>
          ) : detailLoading ? (
            <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200 text-slate-600">
              Loading week detail…
            </div>
          ) : !detail ? (
            <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200 text-slate-600">No detail available.</div>
          ) : (
            <div className="space-y-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="text-sm font-semibold text-slate-900">{detail.user.name?.trim() || detail.user.email}</div>
                  <div className="mt-1 text-xs text-slate-600">Week: {weekRangeLabel(detail.weekStart)}</div>
                  <div className="mt-1 text-xs text-slate-500">WeekStart: {isoDate(new Date(detail.weekStart))}</div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Link
                    href={`/approvals/audit?weekId=${encodeURIComponent(detail.id)}`}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50"
                  >
                    View audit trail
                  </Link>

                  <button
                    onClick={() => review("REJECT")}
                    disabled={!!acting}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50 disabled:opacity-50"
                  >
                    {acting === "REJECT" ? "Rejecting…" : "Reject"}
                  </button>

                  <button
                    onClick={() => review("APPROVE")}
                    disabled={!!acting}
                    className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-50"
                  >
                    {acting === "APPROVE" ? "Approving…" : "Approve"}
                  </button>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-4">
                <Pill label="Status" value="SUBMITTED" />
                <Pill label="Worked" value={fmt2(computed?.totals.workingHours)} />
                <Pill label="Unpaid break" value={fmt2(computed?.totals.breakHours)} />
                <Pill label="Paid" value={fmt2(computed?.totals.paidHours)} />
              </div>

              <div className="grid gap-3 sm:grid-cols-4">
                <Pill label="Regular" value={fmt2(detail.totals.regular)} />
                <Pill label="OT Mon–Fri" value={fmt2(detail.totals.otMonFri)} />
                <Pill label="OT Sat" value={fmt2(detail.totals.otSat)} />
                <Pill label="OT Sun/BH" value={fmt2(detail.totals.otSunBh)} />
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <Pill label="Raw total (all entries)" value={fmt2(detail.totals.hours)} />
                <Pill label="OT total" value={fmt2(exceptions.otTotal)} />
                <Pill label="Overnights" value={exceptions.overnightCount || "0"} />
              </div>

              {/* Comment */}
              <div>
                <div className="text-xs font-semibold text-slate-700">Comment</div>
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  rows={3}
                  placeholder="Required for rejection; optional for approval…"
                  className="mt-2 w-full rounded-2xl bg-white px-4 py-3 text-base text-slate-900 ring-1 ring-slate-200 outline-none focus:ring-2 focus:ring-cyan-300"
                />
                <div className="mt-2 text-[11px] text-slate-500">
                  Break rule: {breakLabel}. Working = Work + Training (incl travel).
                </div>
              </div>

              {/* Entries (day by day) */}
              <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold text-slate-900">Week entries</div>
                  <div className="text-xs text-slate-500">{detail.entries.length} entry(s)</div>
                </div>

                <div className="mt-3 space-y-3">
                  {groupedByDay.length === 0 ? (
                    <div className="text-sm text-slate-600">No entries.</div>
                  ) : (
                    groupedByDay.map((g) => {
                      const dayComputed =
                        computed?.days?.find((d) => d.date === g.dayIso) ??
                        computeFallback(g.entries).days?.find((d) => d.date === g.dayIso);

                      const dayPaid = dayComputed?.paidHours ?? g.entries.reduce((s, e) => s + (Number(e.hours) || 0), 0);
                      const dayWorked = dayComputed?.workingHours ?? 0;
                      const dayBreak = dayComputed?.breakHours ?? 0;

                      return (
                        <div key={g.dayIso} className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
                          <div className="flex items-start justify-between gap-3">
                            <div className="text-sm font-semibold text-slate-900">{dayHeading(g.dayIso)}</div>
                            <div className="text-right">
                              <div className="text-sm font-semibold text-slate-900">{fmt2(dayPaid)}h paid</div>
                              <div className="text-[11px] text-slate-600">
                                Worked {fmt2(dayWorked)}h{dayBreak ? ` • Break ${fmt2(dayBreak)}h` : ""}
                              </div>
                            </div>
                          </div>

                          <div className="mt-3 space-y-3">
                            {g.entries.map((e) => {
                              const ot =
                                (Number(e.otMonFriHours) || 0) + (Number(e.otSatHours) || 0) + (Number(e.otSunBhHours) || 0);

                              return (
                                <div key={e.id} className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="space-y-1">
                                      <div className="flex items-center gap-2">
                                        <TypeBadge type={e.type} />
                                        <div className="text-sm font-semibold text-slate-900">{entryTypeLabel(e.type)}</div>
                                      </div>

                                      <div className="text-xs text-slate-700">
                                        <span className="font-semibold">Job/Site:</span> {jobLabel(e.job, e.type)}
                                        <span className="mx-2 text-slate-300">•</span>
                                        <span className="font-semibold">Time:</span> {e.startTime}–{e.finishTime}
                                        {e.overnight ? (
                                          <>
                                            <span className="mx-2 text-slate-300">•</span>
                                            <span className="font-semibold text-emerald-700">Overnight</span>
                                          </>
                                        ) : null}
                                      </div>

                                      {e.description ? (
                                        <div className="text-xs text-slate-600">
                                          <span className="font-semibold">Notes:</span> {e.description}
                                        </div>
                                      ) : null}
                                    </div>

                                    <div className="text-right">
                                      <div className="text-sm font-semibold text-slate-900">{fmt2(e.hours)}h</div>
                                      {ot > 0 ? (
                                        <div className="mt-1 text-[11px] font-semibold text-amber-800">OT {fmt2(ot)}h</div>
                                      ) : (
                                        <div className="mt-1 text-[11px] text-slate-500">—</div>
                                      )}
                                    </div>
                                  </div>

                                  {(e.type || "WORK").toUpperCase() === "WORK" || (e.type || "").toUpperCase() === "TRAINING" ? (
                                    <div className="mt-2 grid gap-2 sm:grid-cols-3">
                                      <div className="rounded-lg bg-white px-3 py-2 text-xs ring-1 ring-slate-200">
                                        <span className="font-semibold">Regular:</span> {fmt2(e.regularHours)}
                                      </div>
                                      <div className="rounded-lg bg-white px-3 py-2 text-xs ring-1 ring-slate-200">
                                        <span className="font-semibold">OT Mon–Fri:</span> {fmt2(e.otMonFriHours)}
                                      </div>
                                      <div className="rounded-lg bg-white px-3 py-2 text-xs ring-1 ring-slate-200">
                                        <span className="font-semibold">OT Sat/Sun:</span>{" "}
                                        {fmt2((Number(e.otSatHours) || 0) + (Number(e.otSunBhHours) || 0))}
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

              <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
                <div className="text-sm font-semibold text-slate-900">Quick actions</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link
                    href={`/timesheet?weekStart=${encodeURIComponent(isoDate(new Date(detail.weekStart)))}`}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50"
                  >
                    View week in grid
                  </Link>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}