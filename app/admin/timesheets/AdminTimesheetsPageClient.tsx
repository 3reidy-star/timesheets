"use client";

import { useEffect, useMemo, useState } from "react";

type WeekStatus = "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED";

type WeekRow = {
  id: string;
  weekStart: string;
  status: WeekStatus;
  totalHours: number;
  workingHours: number;
  breakHours: number;
  paidHours: number;
  user: {
    id: string;
    name: string | null;
    email: string | null;
  };
};

type WeekDetail = {
  id: string;
  weekStart: string;
  status: WeekStatus;
  user: {
    name: string | null;
    email: string | null;
  };
  entries: any[];
  totals: {
    hours: number;
    regular: number;
    otMonFri: number;
    otSat: number;
    otSunBh: number;
  };
};

export default function AdminTimesheetsPageClient() {
  const [weeks, setWeeks] = useState<WeekRow[]>([]);
  const [selectedUser, setSelectedUser] = useState("ALL");
  const [selectedStatus, setSelectedStatus] = useState("ALL");
  const [selectedWeek, setSelectedWeek] = useState<WeekDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    loadWeeks();
  }, []);

  async function loadWeeks() {
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/weeks/submitted", { cache: "no-store" });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "Failed to load timesheets");
      }

      setWeeks(data.weeks || []);
    } catch (err: any) {
      setError(err?.message || "Failed to load timesheets");
    } finally {
      setLoading(false);
    }
  }

  async function viewWeek(weekId: string) {
    setDetailLoading(true);
    setSelectedWeek(null);
    setError("");

    try {
      const res = await fetch(`/api/week/detail?weekId=${weekId}`, {
        cache: "no-store",
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "Failed to load week detail");
      }

      setSelectedWeek(data.week);
    } catch (err: any) {
      setError(err?.message || "Failed to load week detail");
    } finally {
      setDetailLoading(false);
    }
  }

  const users = useMemo(() => {
    const map = new Map<string, string>();

    for (const week of weeks) {
      map.set(
        week.user.id,
        week.user.name || week.user.email || "Unnamed user"
      );
    }

    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [weeks]);

  const filteredWeeks = weeks.filter((week) => {
    if (selectedUser !== "ALL" && week.user.id !== selectedUser) return false;
    if (selectedStatus !== "ALL" && week.status !== selectedStatus) return false;
    return true;
  });

  return (
    <main className="mx-auto max-w-7xl px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Admin Timesheets</h1>
        <p className="mt-1 text-sm text-slate-600">
          View engineer timesheets before and after submission.
        </p>
      </div>

      {error ? (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="mb-6 grid gap-4 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-2">
        <label className="text-sm">
          <span className="mb-1 block font-medium">Person</span>
          <select
            value={selectedUser}
            onChange={(e) => setSelectedUser(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
          >
            <option value="ALL">All users</option>
            {users.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm">
          <span className="mb-1 block font-medium">Status</span>
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
          >
            <option value="ALL">All statuses</option>
            <option value="DRAFT">Draft</option>
            <option value="SUBMITTED">Submitted</option>
            <option value="APPROVED">Approved</option>
            <option value="REJECTED">Rejected</option>
          </select>
        </label>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Person</th>
                <th className="px-4 py-3">Week</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Hours</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td className="px-4 py-4" colSpan={5}>
                    Loading...
                  </td>
                </tr>
              ) : filteredWeeks.length === 0 ? (
                <tr>
                  <td className="px-4 py-4" colSpan={5}>
                    No timesheets found.
                  </td>
                </tr>
              ) : (
                filteredWeeks.map((week) => (
                  <tr key={week.id}>
                    <td className="px-4 py-3 font-medium">
                      {week.user.name || week.user.email || "Unnamed user"}
                    </td>
                    <td className="px-4 py-3">{formatDate(week.weekStart)}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={week.status} />
                    </td>
                    <td className="px-4 py-3">{week.totalHours}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => viewWeek(week.id)}
                        className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-700"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <section className="rounded-xl border border-slate-200 bg-white p-5">
          {!selectedWeek && !detailLoading ? (
            <div className="text-sm text-slate-500">
              Select a timesheet to view the entries.
            </div>
          ) : null}

          {detailLoading ? (
            <div className="text-sm text-slate-500">Loading detail...</div>
          ) : null}

          {selectedWeek ? (
            <>
              <div className="mb-4">
                <h2 className="text-lg font-semibold">
                  {selectedWeek.user.name ||
                    selectedWeek.user.email ||
                    "Unnamed user"}
                </h2>
                <p className="text-sm text-slate-600">
                  Week commencing {formatDate(selectedWeek.weekStart)}
                </p>
                <div className="mt-2">
                  <StatusBadge status={selectedWeek.status} />
                </div>
              </div>

              <div className="mb-4 grid grid-cols-2 gap-3 text-sm md:grid-cols-5">
                <Summary label="Total" value={selectedWeek.totals.hours} />
                <Summary label="Regular" value={selectedWeek.totals.regular} />
                <Summary label="OT Mon-Fri" value={selectedWeek.totals.otMonFri} />
                <Summary label="OT Sat" value={selectedWeek.totals.otSat} />
                <Summary label="OT Sun/BH" value={selectedWeek.totals.otSunBh} />
              </div>

              <div className="overflow-hidden rounded-lg border border-slate-200">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Date</th>
                      <th className="px-3 py-2">Type</th>
                      <th className="px-3 py-2">Job</th>
                      <th className="px-3 py-2">Times</th>
                      <th className="px-3 py-2">Hours</th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-100">
                    {selectedWeek.entries.length === 0 ? (
                      <tr>
                        <td className="px-3 py-3" colSpan={5}>
                          No entries yet.
                        </td>
                      </tr>
                    ) : (
                      selectedWeek.entries.map((entry) => (
                        <tr key={entry.id}>
                          <td className="px-3 py-2">{formatDate(entry.date)}</td>
                          <td className="px-3 py-2">{entry.type}</td>
                          <td className="px-3 py-2">{entry.job || "-"}</td>
                          <td className="px-3 py-2">
                            {entry.startTime} - {entry.finishTime}
                          </td>
                          <td className="px-3 py-2">{entry.hours}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}
        </section>
      </div>
    </main>
  );
}

function StatusBadge({ status }: { status: WeekStatus }) {
  const classes =
    status === "DRAFT"
      ? "bg-yellow-100 text-yellow-800"
      : status === "SUBMITTED"
        ? "bg-blue-100 text-blue-800"
        : status === "APPROVED"
          ? "bg-green-100 text-green-800"
          : "bg-red-100 text-red-800";

  return (
    <span className={`rounded-full px-2 py-1 text-xs font-semibold ${classes}`}>
      {status}
    </span>
  );
}

function Summary({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-GB");
}