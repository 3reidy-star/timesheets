"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

type Audit = {
  id: string;
  action: string;
  comment: string | null;
  createdAt: string;
  performedBy: { id: string; name: string | null; email: string };
};

async function readJsonOrText(r: Response) {
  const ct = r.headers.get("content-type") || "";
  if (ct.includes("application/json")) return r.json();
  const t = await r.text();
  return { error: t.slice(0, 1200) };
}

function fmtAuditAction(a: string) {
  switch (a) {
    case "CREATED":
      return "Created";
    case "SUBMITTED":
      return "Submitted";
    case "APPROVED":
      return "Approved";
    case "REJECTED":
      return "Rejected";
    case "EDITED":
      return "Edited";
    default:
      return a;
  }
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

export default function ApprovalAuditPageClient() {
  const sp = useSearchParams();
  const weekId = useMemo(() => sp.get("weekId") || "", [sp]);

  const [loading, setLoading] = useState(true);
  const [audits, setAudits] = useState<Audit[]>([]);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    if (!weekId) {
      setErr("weekId is required");
      setLoading(false);
      return;
    }

    setLoading(true);
    setErr(null);

    try {
      const r = await fetch(`/api/week/audits?weekId=${encodeURIComponent(weekId)}`, {
        cache: "no-store",
      });
      const data = await readJsonOrText(r);
      if (!r.ok) throw new Error((data as any)?.error ?? "Failed to load audit trail");

      setAudits(((data as any)?.audits ?? []) as Audit[]);
    } catch (e: any) {
      setAudits([]);
      setErr(e?.message ?? "Failed to load audit trail");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekId]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Audit trail</h1>
          <p className="mt-1 text-sm text-slate-600">History of actions for this week.</p>
        </div>

        <Link
          href="/approvals"
          className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50"
        >
          ← Back to approvals
        </Link>
      </div>

      {err ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{err}</div>
      ) : null}

      <section className="rounded-3xl bg-white p-6 ring-1 ring-slate-200 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-slate-900">Events</div>
          <div className="text-xs text-slate-500">{loading ? "Loading…" : `${audits.length} event(s)`}</div>
        </div>

        <div className="mt-4 space-y-3">
          {loading ? (
            <div className="rounded-2xl bg-slate-50 p-4 text-slate-600 ring-1 ring-slate-200">Loading…</div>
          ) : audits.length === 0 ? (
            <div className="rounded-2xl bg-slate-50 p-4 text-slate-600 ring-1 ring-slate-200">No audit events.</div>
          ) : (
            audits.map((a) => {
              const who = a.performedBy.name?.trim() || a.performedBy.email;
              return (
                <div key={a.id} className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-slate-900">{fmtAuditAction(a.action)}</div>
                      <div className="mt-1 text-xs text-slate-600">
                        {who} • {fmtWhen(a.createdAt)}
                      </div>
                    </div>
                  </div>

                  {a.comment ? (
                    <div className="mt-3 rounded-xl bg-white px-3 py-2 text-sm text-slate-800 ring-1 ring-slate-200">
                      {a.comment}
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