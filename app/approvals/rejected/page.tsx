"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type RejectedItem = {
  weekId: string;
  weekStart: string;
  status: string;
  totalHours: number;
  user: { id: string; name: string | null; email: string };
  rejectedAt: string;
  rejectedBy: { id: string; name: string | null; email: string };
  comment: string | null;
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

function fmtWhen(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function RejectedWeeksPage() {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<RejectedItem[]>([]);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch("/api/weeks/rejected", { cache: "no-store" });
      const data = await readJsonOrText(r);
      if (!r.ok) throw new Error((data as any)?.error ?? "Failed to load sent back weeks");
      setItems(((data as any)?.weeks ?? []) as RejectedItem[]);
    } catch (e: any) {
      setItems([]);
      setErr(e?.message ?? "Failed to load sent back weeks");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Sent back</h1>
          <p className="mt-1 text-sm text-slate-600">
            Weeks rejected and returned to engineers for correction.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={load}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50"
          >
            Refresh
          </button>

          <Link
            href="/approvals"
            className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-cyan-400"
          >
            Back to approvals →
          </Link>
        </div>
      </div>

      {err ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {err}
        </div>
      ) : null}

      <section className="rounded-3xl bg-white p-6 ring-1 ring-slate-200 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-slate-900">Rejected weeks</div>
          <div className="text-xs text-slate-500">
            {loading ? "Loading…" : `${items.length} item(s)`}
          </div>
        </div>

        <div className="mt-4 space-y-3">
          {loading ? (
            <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200 text-slate-600">
              Loading…
            </div>
          ) : items.length === 0 ? (
            <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200 text-slate-600">
              Nothing has been sent back yet.
            </div>
          ) : (
            items.map((x) => {
              const who = x.user.name?.trim() || x.user.email;
              const by = x.rejectedBy.name?.trim() || x.rejectedBy.email;
              const weekStartIso = isoDate(new Date(x.weekStart));

              return (
                <div key={x.weekId} className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-sm font-semibold text-slate-900">{who}</div>
                      <div className="mt-1 text-xs text-slate-600">
                        WeekStart: {weekStartIso} • Current status:{" "}
                        <span className="font-semibold">{x.status}</span>
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        Rejected by {by} • {fmtWhen(x.rejectedAt)}
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-sm font-semibold text-slate-900">
                        {fmt2(x.totalHours)} hrs
                      </div>

                      <Link
                        href={`/timesheet?weekStart=${encodeURIComponent(weekStartIso)}`}
                        className="mt-2 inline-flex rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50"
                      >
                        View week
                      </Link>
                    </div>
                  </div>

                  {x.comment ? (
                    <div className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-700 ring-1 ring-slate-200">
                      <span className="font-semibold">Reason:</span> {x.comment}
                    </div>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}
