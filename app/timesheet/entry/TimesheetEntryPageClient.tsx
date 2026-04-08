"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type EntryType = "WORK" | "HOLIDAY_FULL" | "HOLIDAY_HALF" | "SICK" | "TRAINING";
type HalfDay = "AM" | "PM";

const BREAK_THRESHOLD_HOURS = 8;
const BREAK_HOURS = 0.5;

async function readJsonOrText(r: Response) {
  const ct = r.headers.get("content-type") || "";
  if (ct.includes("application/json")) return r.json();
  const t = await r.text();
  return { error: t.slice(0, 1200) };
}

function parseHHMM(value: string) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return hh * 60 + mm;
}

function parseHHMMStrict(value: string) {
  const m = /^(\d{2}):(\d{2})$/.exec(value);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return hh * 60 + mm;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function fmt2(n: number) {
  return (Number.isFinite(n) ? n : 0).toFixed(2);
}

function isoDateFromWeekStart(weekStart: string) {
  if (!weekStart) return "";
  const d = new Date(`${weekStart}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function dayNameLong(dateIso: string) {
  if (!dateIso) return "—";
  const d = new Date(`${dateIso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { weekday: "long" });
}

function prettyDate(dateIso: string) {
  if (!dateIso) return "—";
  const d = new Date(`${dateIso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function entryTypeLabel(t: EntryType) {
  switch (t) {
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
  }
}

function standardHoursForDate(dateIso: string) {
  if (!dateIso) return 0;
  const d = new Date(`${dateIso}T00:00:00`);
  const dow = d.getDay();
  if (dow >= 1 && dow <= 4) return 8;
  if (dow === 5) return 5;
  return 0;
}

function standardTimesForDate(dateIso: string) {
  if (!dateIso) return { start: "08:30", finish: "17:00" };
  const d = new Date(`${dateIso}T00:00:00`);
  const dow = d.getDay();
  if (dow === 5) return { start: "08:30", finish: "14:00" };
  return { start: "08:30", finish: "17:00" };
}

function halfDayTimesForDate(dateIso: string, half: HalfDay) {
  if (!dateIso) {
    return half === "PM"
      ? { start: "13:00", finish: "17:00", label: "PM" }
      : { start: "08:30", finish: "12:30", label: "AM" };
  }

  const d = new Date(`${dateIso}T00:00:00`);
  const dow = d.getDay();

  if (dow === 5) {
    return half === "PM"
      ? { start: "11:30", finish: "14:00", label: "PM (11:30–14:00)" }
      : { start: "08:30", finish: "11:00", label: "AM (08:30–11:00)" };
  }

  return half === "PM"
    ? { start: "13:00", finish: "17:00", label: "PM (13:00–17:00)" }
    : { start: "08:30", finish: "12:30", label: "AM (08:30–12:30)" };
}

function isLikelyEarlyFinish(dateIso: string, finishTime: string) {
  if (!dateIso) return false;
  const standard = standardTimesForDate(dateIso);
  const finishMin = parseHHMMStrict(finishTime);
  const standardFinishMin = parseHHMMStrict(standard.finish);

  if (finishMin === null || standardFinishMin === null) return false;
  return finishMin < standardFinishMin;
}

function calcWorkPreview(
  dateIso: string,
  startTime: string,
  finishTime: string,
  leftEarlyByChoice: boolean
) {
  if (!dateIso) {
    return {
      ok: false as const,
      error: "Date is required",
      total: 0,
      reg: 0,
      otMonFri: 0,
      otSat: 0,
      otSunBh: 0,
    };
  }

  const date = new Date(`${dateIso}T00:00:00`);
  const startMin = parseHHMM(startTime);
  const finishMinRaw = parseHHMM(finishTime);

  if (Number.isNaN(date.getTime())) {
    return {
      ok: false as const,
      error: "Invalid date",
      total: 0,
      reg: 0,
      otMonFri: 0,
      otSat: 0,
      otSunBh: 0,
    };
  }
  if (startMin === null) {
    return {
      ok: false as const,
      error: "Invalid start time",
      total: 0,
      reg: 0,
      otMonFri: 0,
      otSat: 0,
      otSunBh: 0,
    };
  }
  if (finishMinRaw === null) {
    return {
      ok: false as const,
      error: "Invalid finish time",
      total: 0,
      reg: 0,
      otMonFri: 0,
      otSat: 0,
      otSunBh: 0,
    };
  }

  let finishMin = finishMinRaw;
  if (finishMinRaw < startMin) finishMin += 24 * 60;

  const durationMin = finishMin - startMin;
  if (durationMin <= 0) {
    return {
      ok: false as const,
      error: "Finish must be after start",
      total: 0,
      reg: 0,
      otMonFri: 0,
      otSat: 0,
      otSunBh: 0,
    };
  }

  let totalHours = durationMin / 60;

  if (!leftEarlyByChoice && totalHours >= 6) {
    totalHours -= 0.5;
  }

  totalHours = round2(Math.max(0, totalHours));

  const day = date.getDay();
  const regularCap = day === 5 ? 5 : day >= 1 && day <= 4 ? 8 : 0;

  const reg = round2(Math.min(regularCap, totalHours));
  const overtime = round2(Math.max(0, totalHours - regularCap));

  let otMonFri = 0;
  let otSat = 0;
  let otSunBh = 0;

  if (overtime > 0) {
    if (day >= 1 && day <= 5) otMonFri = overtime;
    else if (day === 6) otSat = overtime;
    else otSunBh = overtime;
  }

  return { ok: true as const, error: null as any, total: totalHours, reg, otMonFri, otSat, otSunBh };
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="text-xs font-semibold text-slate-700">{children}</div>;
}

function InputCard({ children }: { children: React.ReactNode }) {
  return <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200 shadow-sm">{children}</div>;
}

function CalcTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
      <div className="text-xs font-semibold text-slate-600">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-slate-900">{value}</div>
    </div>
  );
}

export default function TimesheetEntryPageClient() {
  const router = useRouter();
  const sp = useSearchParams();

  const weekStart = sp.get("weekStart") || "";
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [type, setType] = useState<EntryType>("WORK");
  const [halfDay, setHalfDay] = useState<HalfDay>("AM");
  const [dateIso, setDateIso] = useState(isoDateFromWeekStart(weekStart));
  const [job, setJob] = useState("");
  const [startTime, setStartTime] = useState("08:30");
  const [finishTime, setFinishTime] = useState("17:00");
  const [overnight, setOvernight] = useState(false);
  const [leftEarlyByChoice, setLeftEarlyByChoice] = useState(false);
  const [dismissedEarlyFinishCallout, setDismissedEarlyFinishCallout] = useState(false);
  const [description, setDescription] = useState("");
  const [agreedRate, setAgreedRate] = useState("");

  const isWork = type === "WORK";
  const isHalfHoliday = type === "HOLIDAY_HALF";

  useEffect(() => {
    if (!dateIso && weekStart) {
      setDateIso(isoDateFromWeekStart(weekStart));
    }
  }, [weekStart, dateIso]);

  useEffect(() => {
    if (!isHalfHoliday || !dateIso) return;
    const times = halfDayTimesForDate(dateIso, halfDay);
    setStartTime(times.start);
    setFinishTime(times.finish);
  }, [isHalfHoliday, halfDay, dateIso]);

  useEffect(() => {
    if (isWork) return;
    if (isHalfHoliday) return;
    if (!dateIso) return;
    const times = standardTimesForDate(dateIso);
    setStartTime(times.start);
    setFinishTime(times.finish);
  }, [isWork, isHalfHoliday, dateIso]);

  useEffect(() => {
    if (!isWork && leftEarlyByChoice) {
      setLeftEarlyByChoice(false);
    }
  }, [isWork, leftEarlyByChoice]);

  useEffect(() => {
    setDismissedEarlyFinishCallout(false);
  }, [dateIso, startTime, finishTime, type]);

  const preview = useMemo(() => {
    if (!dateIso) {
      return { ok: true as const, error: null as any, total: 0, reg: 0, otMonFri: 0, otSat: 0, otSunBh: 0 };
    }

    if (!isWork) {
      const base = standardHoursForDate(dateIso);

      if (type === "HOLIDAY_HALF") {
        const hours = round2(base / 2);
        return {
          ok: true as const,
          error: null as any,
          total: hours,
          reg: hours,
          otMonFri: 0,
          otSat: 0,
          otSunBh: 0,
        };
      }

      if (type === "HOLIDAY_FULL" || type === "SICK" || type === "TRAINING") {
        const hours = round2(base);
        return {
          ok: true as const,
          error: null as any,
          total: hours,
          reg: hours,
          otMonFri: 0,
          otSat: 0,
          otSunBh: 0,
        };
      }

      return { ok: true as const, error: null as any, total: 0, reg: 0, otMonFri: 0, otSat: 0, otSunBh: 0 };
    }

    return calcWorkPreview(dateIso, startTime, finishTime, leftEarlyByChoice);
  }, [dateIso, startTime, finishTime, isWork, type, leftEarlyByChoice]);

  const showEarlyFinishCallout =
    isWork &&
    !leftEarlyByChoice &&
    !dismissedEarlyFinishCallout &&
    !!dateIso &&
    isLikelyEarlyFinish(dateIso, finishTime);

  const canSave = !!dateIso && preview.ok && (!isWork || !!job.trim()) && !saving;

  async function createEntry() {
    if (!canSave) {
      setErr("Please complete the required fields.");
      return;
    }

    setSaving(true);
    setErr(null);

    try {
      const agreed =
        agreedRate.trim() === ""
          ? null
          : Number.isFinite(Number(agreedRate))
          ? Number(agreedRate)
          : null;

      const payload = {
        date: dateIso,
        type,
        startTime,
        finishTime,
        overnight: !!overnight,
        leftEarlyByChoice: isWork ? !!leftEarlyByChoice : false,
        agreedRate: agreed,
        description: description.trim() ? description.trim() : null,
        job: isWork ? (job.trim() ? job.trim() : null) : null,
        halfDay: isHalfHoliday ? halfDay : undefined,
      };

      const r = await fetch("/api/entry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await readJsonOrText(r);
      if (!r.ok) throw new Error((data as any)?.error ?? "Failed to create entry");

      const nextWeekStart = (data as any)?.weekStart
        ? String((data as any).weekStart).slice(0, 10)
        : weekStart;

      router.push(`/timesheet?weekStart=${encodeURIComponent(nextWeekStart)}`);
      router.refresh();
    } catch (e: any) {
      setErr(e?.message ?? "Failed to create entry");
    } finally {
      setSaving(false);
    }
  }

  const backHref = weekStart ? `/timesheet?weekStart=${encodeURIComponent(weekStart)}` : "/timesheet";

  const halfLabels = dateIso
    ? {
        am: halfDayTimesForDate(dateIso, "AM").label,
        pm: halfDayTimesForDate(dateIso, "PM").label,
      }
    : {
        am: "AM",
        pm: "PM",
      };

  return (
    <div className="mx-auto w-full max-w-md space-y-4">
      {err ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{err}</div>
      ) : null}

      <InputCard>
        <h1 className="text-2xl font-semibold text-slate-900">Add entry</h1>
        <p className="mt-2 text-sm text-slate-600">
          For Work: do not include lunch. If total working time in a day is{" "}
          <span className="font-semibold text-slate-900">
            {BREAK_THRESHOLD_HOURS} hours or more, {BREAK_HOURS} hours is unpaid
          </span>
          .
        </p>

        <div className="mt-6 space-y-4">
          <div>
            <Label>Entry type</Label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as EntryType)}
              className="mt-2 w-full rounded-2xl bg-white px-4 py-3 text-base text-slate-900 ring-1 ring-slate-200 outline-none focus:ring-2 focus:ring-cyan-300"
            >
              {(["WORK", "HOLIDAY_FULL", "HOLIDAY_HALF", "SICK", "TRAINING"] as EntryType[]).map((t) => (
                <option key={t} value={t}>
                  {entryTypeLabel(t)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <Label>Date</Label>
            <input
              type="date"
              value={dateIso}
              onChange={(e) => setDateIso(e.target.value)}
              className="mt-2 w-full rounded-2xl bg-white px-4 py-3 text-base text-slate-900 ring-1 ring-slate-200 outline-none focus:ring-2 focus:ring-cyan-300"
            />
            <div className="mt-2 text-sm text-slate-600">
              Day: <span className="font-semibold">{dayNameLong(dateIso)}</span>
              <span className="ml-2 text-slate-400">({prettyDate(dateIso)})</span>
            </div>
          </div>

          {isHalfHoliday ? (
            <div>
              <Label>Half day allocation</Label>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setHalfDay("AM")}
                  className={`rounded-2xl px-4 py-3 text-sm font-semibold ring-1 ${
                    halfDay === "AM"
                      ? "bg-cyan-500 text-slate-900 ring-cyan-400"
                      : "bg-white text-slate-900 ring-slate-200 hover:bg-slate-50"
                  }`}
                >
                  {halfLabels.am}
                </button>
                <button
                  type="button"
                  onClick={() => setHalfDay("PM")}
                  className={`rounded-2xl px-4 py-3 text-sm font-semibold ring-1 ${
                    halfDay === "PM"
                      ? "bg-cyan-500 text-slate-900 ring-cyan-400"
                      : "bg-white text-slate-900 ring-slate-200 hover:bg-slate-50"
                  }`}
                >
                  {halfLabels.pm}
                </button>
              </div>
            </div>
          ) : null}

          <div className={isWork ? "" : "pointer-events-none opacity-50"}>
            <Label>Job / Site (free text)</Label>
            <input
              value={job}
              onChange={(e) => setJob(e.target.value)}
              placeholder="e.g. Client / Site ref"
              className="mt-2 w-full rounded-2xl bg-white px-4 py-3 text-base text-slate-900 ring-1 ring-slate-200 outline-none focus:ring-2 focus:ring-cyan-300"
            />
          </div>

          {isWork ? (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Start Time</Label>
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="mt-2 w-full rounded-2xl bg-white px-4 py-3 text-base text-slate-900 ring-1 ring-slate-200 outline-none focus:ring-2 focus:ring-cyan-300"
                />
              </div>

              <div>
                <Label>Finish Time</Label>
                <input
                  type="time"
                  value={finishTime}
                  onChange={(e) => setFinishTime(e.target.value)}
                  className="mt-2 w-full rounded-2xl bg-white px-4 py-3 text-base text-slate-900 ring-1 ring-slate-200 outline-none focus:ring-2 focus:ring-cyan-300"
                />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Start Time</Label>
                <input
                  type="time"
                  value={startTime}
                  readOnly
                  className="mt-2 w-full rounded-2xl bg-slate-50 px-4 py-3 text-base text-slate-900 ring-1 ring-slate-200"
                />
              </div>

              <div>
                <Label>Finish Time</Label>
                <input
                  type="time"
                  value={finishTime}
                  readOnly
                  className="mt-2 w-full rounded-2xl bg-slate-50 px-4 py-3 text-base text-slate-900 ring-1 ring-slate-200"
                />
              </div>
            </div>
          )}

          {showEarlyFinishCallout ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <div className="text-sm font-semibold text-amber-900">This looks like an early finish</div>
              <div className="mt-1 text-sm text-amber-800">
                If the employee asked to go home early, apply the early finish rule so they are only
                paid for hours worked plus any actual overtime.
              </div>

              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setLeftEarlyByChoice(true);
                    setDismissedEarlyFinishCallout(true);
                  }}
                  className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-amber-400"
                >
                  Apply early finish rule
                </button>

                <button
                  type="button"
                  onClick={() => setDismissedEarlyFinishCallout(true)}
                  className="rounded-xl border border-amber-200 bg-white px-4 py-2 text-sm font-semibold text-amber-900 hover:bg-amber-100"
                >
                  Ignore
                </button>
              </div>
            </div>
          ) : null}

          {isWork ? (
            <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-sm font-semibold text-slate-900">Employee requested to finish early</div>
                  <div className="text-sm text-slate-600">
                    Pays actual worked hours and overtime only, with no break deduction.
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setLeftEarlyByChoice((v) => !v)}
                  className={`h-10 w-16 rounded-full p-1 ring-1 transition ${
                    leftEarlyByChoice ? "bg-amber-500 ring-amber-400" : "bg-white ring-slate-300"
                  }`}
                  aria-label="Toggle left early by choice"
                >
                  <div
                    className={`h-8 w-8 rounded-full bg-white shadow transition ${
                      leftEarlyByChoice ? "translate-x-6" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>
            </div>
          ) : null}

          <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-sm font-semibold text-slate-900">Overnight stay allowance (£35)</div>
                <div className="text-sm text-slate-600">Tick if stayed away from home (adds £35)</div>
              </div>

              <button
                type="button"
                onClick={() => setOvernight((v) => !v)}
                className={`h-10 w-16 rounded-full p-1 ring-1 transition ${
                  overnight ? "bg-emerald-500 ring-emerald-400" : "bg-white ring-slate-300"
                }`}
                aria-label="Toggle overnight allowance"
              >
                <div
                  className={`h-8 w-8 rounded-full bg-white shadow transition ${
                    overnight ? "translate-x-6" : "translate-x-0"
                  }`}
                />
              </button>
            </div>
          </div>

          <div className="mt-2">
            <div className="text-lg font-semibold text-slate-900">Calculated</div>

            <div className="mt-3 grid grid-cols-2 gap-3">
              <CalcTile label="Hours (Regular)" value={fmt2(preview.reg)} />
              <CalcTile label="Total Job Hrs" value={fmt2(preview.total)} />
              <CalcTile label="Hours (O/T) Mon - Fri" value={fmt2(preview.otMonFri)} />
              <CalcTile label="Hours (O/T) Saturday" value={fmt2(preview.otSat)} />
              <div className="col-span-2">
                <CalcTile label="Hours (O/T) Sunday/BH" value={fmt2(preview.otSunBh)} />
              </div>
            </div>
          </div>

          <div>
            <Label>Agreed rate (optional)</Label>
            <input
              value={agreedRate}
              onChange={(e) => setAgreedRate(e.target.value)}
              inputMode="decimal"
              placeholder="e.g. 25.00"
              className="mt-2 w-full rounded-2xl bg-white px-4 py-3 text-base text-slate-900 ring-1 ring-slate-200 outline-none focus:ring-2 focus:ring-cyan-300"
            />
          </div>

          <div>
            <Label>Notes (optional)</Label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Any notes for accounts…"
              className="mt-2 w-full rounded-2xl bg-white px-4 py-3 text-base text-slate-900 ring-1 ring-slate-200 outline-none focus:ring-2 focus:ring-cyan-300"
            />
          </div>

          <button
            type="button"
            onClick={createEntry}
            disabled={!canSave}
            className="mt-2 w-full rounded-2xl bg-cyan-500 px-5 py-3 text-base font-semibold text-slate-900 shadow-sm hover:bg-cyan-400 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save entry"}
          </button>

          <div className="flex items-center justify-between">
            <Link href={backHref} className="text-sm font-semibold text-slate-600 hover:text-slate-800">
              ← Back to weekly timesheet
            </Link>
          </div>
        </div>
      </InputCard>
    </div>
  );
}