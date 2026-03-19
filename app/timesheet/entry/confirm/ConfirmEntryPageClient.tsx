"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export const dynamic = "force-dynamic";

const DRAFT_KEY = "ts_entry_draft_v1";

type EntryType = "WORK" | "HOLIDAY_FULL" | "HOLIDAY_HALF" | "SICK" | "TRAINING";
type HalfDay = "AM" | "PM";

type EntryDraft = {
  weekId: string;
  weekStartIso: string;

  type: EntryType;
  halfDay?: HalfDay;

  date: string;
  startTime: string;
  finishTime: string;

  overnight: boolean;
  leftEarlyByChoice: boolean;

  agreedRate: number | null;
  description: string | null;

  job: string | null;
};

async function readJsonOrText(r: Response) {
  const ct = r.headers.get("content-type") || "";
  if (ct.includes("application/json")) return r.json();
  const t = await r.text();
  return { error: t.slice(0, 1200) };
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

function prettyDate(dateIso: string) {
  const d = new Date(dateIso);
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function halfDayLabel(dateIso: string, half: HalfDay | undefined) {
  const d = new Date(dateIso);
  const dow = d.getDay();

  if (dow === 5) {
    return half === "PM" ? "PM (11:15–14:00)" : "AM (08:30–11:15)";
  }

  return half === "PM" ? "PM (13:00–17:00)" : "AM (08:00–12:00)";
}

export default function ConfirmEntryPage() {
  const router = useRouter();
  const sp = useSearchParams();

  const weekStartIso = useMemo(() => sp.get("weekStart") || "", [sp]);

  const [draft, setDraft] = useState<EntryDraft | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY);
      if (!raw) {
        setDraft(null);
        return;
      }
      const parsed = JSON.parse(raw) as EntryDraft;
      setDraft({
        ...parsed,
        leftEarlyByChoice: !!parsed.leftEarlyByChoice,
      });
    } catch {
      setDraft(null);
    }
  }, []);

  const backHref = `/timesheet/entry?weekStart=${encodeURIComponent(weekStartIso || draft?.weekStartIso || "")}`;

  async function submit() {
    if (!draft) return;
    setErr(null);
    setPosting(true);

    try {
      const payload: any = {
        date: draft.date,
        type: draft.type,
        job: draft.job || "",
        description: draft.description,
        agreedRate: draft.agreedRate,
        overnight: !!draft.overnight,
      };

      if (draft.type === "WORK") {
        payload.startTime = draft.startTime;
        payload.finishTime = draft.finishTime;
        payload.leftEarlyByChoice = !!draft.leftEarlyByChoice;
      }

      if (draft.type === "HOLIDAY_HALF") {
        payload.halfDay = draft.halfDay || "AM";
      }

      const r = await fetch("/api/entry", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      const j = await readJsonOrText(r);
      if (!r.ok) throw new Error((j as any)?.error ?? "Failed to create entry");

      sessionStorage.removeItem(DRAFT_KEY);

      router.push(`/timesheet/entry/saved?weekStart=${encodeURIComponent(draft.weekStartIso)}`);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to create entry");
    } finally {
      setPosting(false);
    }
  }

  if (!draft) {
    return (
      <div className="mx-auto w-full max-w-md">
        <div className="rounded-3xl bg-white p-6 ring-1 ring-slate-200 shadow-sm">
          <h1 className="text-xl font-semibold text-slate-900">No draft found</h1>
          <p className="mt-2 text-sm text-slate-600">Go back and add an entry first.</p>
          <Link
            href={backHref}
            className="mt-4 inline-flex rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-cyan-400"
          >
            Back
          </Link>
        </div>
      </div>
    );
  }

  const isWork = draft.type === "WORK";
  const isHalfHoliday = draft.type === "HOLIDAY_HALF";

  return (
    <div className="mx-auto w-full max-w-md space-y-4">
      {err ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{err}</div>
      ) : null}

      <div className="rounded-3xl bg-white p-6 ring-1 ring-slate-200 shadow-sm space-y-4">
        <div>
          <div className="text-2xl font-semibold text-slate-900">Confirm entry</div>
          <div className="mt-1 text-sm text-slate-600">{prettyDate(draft.date)}</div>
        </div>

        <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200 space-y-2">
          <Row label="Type" value={entryTypeLabel(draft.type)} />

          {isHalfHoliday ? (
            <Row label="Half day" value={halfDayLabel(draft.date, draft.halfDay)} />
          ) : null}

          <Row label="Job / Site" value={draft.job || (isWork ? "(required)" : "—")} />

          {isWork ? (
            <>
              <Row label="Start" value={draft.startTime} />
              <Row label="Finish" value={draft.finishTime} />
              <Row
                label="Left early by choice"
                value={draft.leftEarlyByChoice ? "Yes" : "No"}
              />
            </>
          ) : null}

          <Row label="Overnight allowance" value={draft.overnight ? "Yes (+£35)" : "No"} />

          <Row
            label="Agreed rate"
            value={draft.agreedRate === null ? "—" : `£${draft.agreedRate.toFixed(2)}`}
          />
          <Row label="Notes" value={draft.description || "—"} />
        </div>

        <button
          type="button"
          onClick={submit}
          disabled={posting || (isWork && !draft.job?.trim())}
          className="w-full rounded-2xl bg-cyan-500 px-5 py-3 text-base font-semibold text-slate-900 hover:bg-cyan-400 disabled:opacity-50"
        >
          {posting ? "Saving…" : "Confirm & save"}
        </button>

        <Link href={backHref} className="inline-flex text-sm font-semibold text-slate-600 hover:text-slate-800">
          ← Back
        </Link>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="text-xs font-semibold text-slate-600">{label}</div>
      <div className="text-sm font-semibold text-slate-900 text-right">{value}</div>
    </div>
  );
}