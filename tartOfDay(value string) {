"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Project = { id: string; name: string; code: string | null };

type Entry = {
  id: string;
  date: string;
  hours: number;
  description: string | null;

  // ✅ free text job/site (replaces project relation)
  job: string | null;
};

type Week = {
  id: string;
  weekStart: string;
  status: "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED";
  entries: Entry[];
};

function StatPill({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl bg-slate-50 px-4 py-3 ring-1 ring-slate-200">
      <div className="text-xs font-semibold text-slate-600">{label}</div>
      <div className="mt-1 text-lg font-semibold text-slate-900">{value}</div>
    </div>
  );
}

function Card({
  title,
  description,
  href,
  primaryCta,
  secondaryCta,
  stats,
}: {
  title: string;
  description: string;
  href: string;
  primaryCta: { label: string; href: string };
  secondaryCta?: { label: string; href: string };
  stats?: Array<{ label: string; value: string | number }>;
}) {
  return (
    <div className="rounded-3xl bg-white p-6 ring-1 ring-slate-200 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
          <p className="mt-1 text-sm text-slate-600">{description}</p>
        </div>

        <Link
          href={href}
          className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50 transition"
        >
          Open
        </Link>
      </div>

      {stats?.length ? (
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {stats.map((s) => (
            <StatPill key={s.label} label={s.label} value={s.value} />
          ))}
        </div>
      ) : null}

      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          href={primaryCta.href}
          className="rounded-xl bg-cyan-500 px-5 py-2 text-sm font-semibold text-slate-900 hover:bg-cyan-400 transition"
        >
          {primaryCta.label}
        </Link>

        {secondaryCta ? (
          <Link
            href={secondaryCta.href}
            className="rounded-xl border border-slate-200 bg-white px-5 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50 transition"
          >
            {secondaryCta.label}
          </Link>
        ) : null}
      </div>
    </div>
  );
}

async function readJsonOrText(r: Response) {
  const contentType = r.headers.get("content-type") || "";
  if (contentType.includes("application/json")) return r.json();
  const text = await r.text();
  return { error: text.slice(0, 800) };
}

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [week, setWeek] = useState<Week | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const totalHours = useMemo(() => {
    return (week?.entries ?? []).reduce((sum, e) => sum + (Number(e.hours) || 0), 0);
  }, [week]);

  // ✅ was uniqueSalesOrders based on e.project.name; now based on free text job/site
  const uniqueJobsSites = useMemo(() => {
    const set = new Set(
      (week?.entries ?? [])
        .map((e) => (typeof e.job === "string" ? e.job.trim() : ""))
        .filter(Boolean)
        .map((s) => s.toLowerCase())
    );
    return set.size;
  }, [week]);

  async function refresh() {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch("/api/week", { cache: "no-store" });
      const j: any = await readJsonOrText(r);
      if (!r.ok) throw new Error(j?.error ?? "Failed to load week");
      setWeek(j.week);
      setProjects(j.projects ?? []);
    } catch (e: any) {
      setWeek(null);
      setProjects([]);
      setErr(e?.message ?? "Error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  const weekStartLabel = week ? new Date(week.weekStart).toLocaleDateString() : "—";

  return (
    <div className="py-2">
      {err ? (
        <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {err}
        </div>
      ) : null}

      {/* Hero */}
      <section className="rounded-3xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold text-slate-900">Timesheets</h1>
            <p className="mt-2 text-sm text-slate-600">
              Overview for the week, and (soon) approvals & compliance.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/timesheet"
              className="rounded-xl bg-cyan-500 px-6 py-2.5 text-sm font-semibold text-slate-900 hover:bg-cyan-400 transition"
            >
              Open weekly timesheet →
            </Link>

            <button
              onClick={refresh}
              className="rounded-xl border border-slate-200 bg-white px-6 py-2.5 text-sm font-semibold text-slate-900 hover:bg-slate-50 transition"
            >
              Refresh
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-4">
          <StatPill label="Week start" value={weekStartLabel} />
          <StatPill label="Status" value={week?.status ?? "—"} />
          <StatPill label="Total hours" value={week ? totalHours.toFixed(2) : "—"} />
          <StatPill label="Jobs / Sites" value={week ? uniqueJobsSites : "—"} />
        </div>
      </section>

      {/* Primary cards */}
      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Card
          title="Weekly Timesheet"
          description="Engineers enter hours by job/site using the weekly sheet layout."
          href="/timesheet"
          primaryCta={{ label: "Open timesheet", href: "/timesheet" }}
          secondaryCta={{ label: "View overview", href: "/" }}
          stats={[
            { label: "Week status", value: week?.status ?? "—" },
            { label: "Week hours", value: week ? totalHours.toFixed(2) : "—" },
            { label: "Job/Site count", value: week ? uniqueJobsSites : "—" },
          ]}
        />

        <Card
          title="Approvals (coming soon)"
          description="Review submitted weeks and approve/reject with comments."
          href="/"
          primaryCta={{ label: "Planned: approvals queue", href: "/" }}
          secondaryCta={{ label: "Planned: manager view", href: "/" }}
          stats={[
            { label: "Submitted", value: "—" },
            { label: "Awaiting review", value: "—" },
            { label: "Approved today", value: "—" },
          ]}
        />
      </div>

      {/* Secondary cards */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="rounded-3xl bg-white p-6 ring-1 ring-slate-200 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-900">Team compliance (coming soon)</h2>
          <p className="mt-1 text-sm text-slate-600">
            Identify missing weeks, late submissions, and exceptions (OT / overnight).
          </p>

          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatPill label="Missing" value="—" />
            <StatPill label="Late" value="—" />
            <StatPill label="Exceptions" value="—" />
          </div>

          <p className="mt-5 text-xs text-slate-500">
            Next step: add manager accounts + query weeks by status.
          </p>
        </div>

        <div className="rounded-3xl bg-white p-6 ring-1 ring-slate-200 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-900">System status</h2>
          <p className="mt-1 text-sm text-slate-600">Quick health view for the local build.</p>

          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatPill label="API" value={loading ? "Loading…" : "OK"} />
            <StatPill label="Projects" value={projects.length} />
            <StatPill label="Entries" value={week?.entries.length ?? 0} />
          </div>

          <p className="mt-5 text-xs text-slate-500">
            Once Azure is ready, this can show environment, DB health, etc.
          </p>
        </div>
      </div>
    </div>
  );
}
