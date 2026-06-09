"use client";

import { useMemo, useState } from "react";

export type WeekStatus = "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED";

export type AdminTimesheetEntry = {
  id: string;
  date: string;
  type: string;
  job: string;
  startTime: string;
  finishTime: string;
  hours: number;
  regularHours: number;
  otMonFriHours: number;
  otSatHours: number;
  otSunBhHours: number;
  overnight: boolean;
  agreedRate: number | null;
  description: string | null;
};

export type AdminTimesheetWeek = {
  id: string;
  weekStart: string;
  status: WeekStatus;
  user: {
    id: string;
    name: string | null;
    email: string | null;
  };
  entries: AdminTimesheetEntry[];
  totals: {
    hours: number;
    regular: number;
    otMonFri: number;
    otSat: number;
    otSunBh: number;
  };
};

type Props = {
  weeks: AdminTimesheetWeek[];
};

export default function AdminTimesheetsPageClient({ weeks }: Props) {
  const [selectedUser, setSelectedUser] = useState("ALL");
  const [selectedStatus, setSelectedStatus] = useState("ALL");
  const [selectedWeekId, setSelectedWeekId] = useState<string | null>(null);

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

  const filteredWeeks = useMemo(() => {
    return weeks.filter((week) => {
      if (selectedUser !== "ALL" && week.user.id !== selectedUser) return false;
      if (selectedStatus !== "ALL" && week.status !== selectedStatus) {
        return false;
      }
      return true;
    });
  }, [weeks, selectedUser, selectedStatus]);

  const selectedWeek =
    weeks.find((week) => week.id === selectedWeekId) || filteredWeeks[0] || null;

  return (
    <main className="mx-auto max-w-7xl px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Admin Timesheets</h1>
        <p className="mt-1 text-sm text-slate-600">
          View all user timesheets, including draft, submitted, approved and
          rejected weeks.
        </p>
      </div>

      <div className="mb-6 grid gap-4 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-2">
        <label className="text-sm">
          <span className="mb-1 block font-medium">Employee</span>
          <select
            value={selectedUser}
            onChange={(e) => {
              setSelectedUser(e.target.value);
              setSelectedWeekId(null);
            }}
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
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
          <span className="mb-1 block font-medium">Status</span>
          <select
            value={selectedStatus}
            onChange={(e) => {
              setSelectedStatus(e.target.value);
              setSelectedWeekId(null);
            }}
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
                <th className="px-4 py-3">Employee</th>
                <th className="px-4 py-3">Week</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Hours</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {filteredWeeks.length === 0 ? (
                <tr>
                  <td className="px-4 py-4 text-slate-500" colSpan={5}>
                    No timesheets found.
                  </td>
                </tr>
              ) : (
                filteredWeeks.map((week) => (
                  <tr
                    key={week.id}
                    className={
                      selectedWeek?.id === week.id ? "bg-slate-50" : undefined
                    }
                  >
                    <td className="px-4 py-3 font-medium">
                      {week.user.name || week.user.email || "Unnamed user"}
                    </td>
                    <td className="px-4 py-3">
                      {formatDate(week.weekStart)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={week.status} />
                    </td>
                    <td className="px-4 py-3">
                      {formatHours(week.totals.hours)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => setSelectedWeekId(week.id)}
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
          {!selectedWeek ? (
            <div className="text-sm text-slate-500">
              Select a timesheet to view the entries.
            </div>
          ) : (
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
                <Summary
                  label="OT Mon-Fri"
                  value={selectedWeek.totals.otMonFri}
                />
                <Summary label="OT Sat" value={selectedWeek.totals.otSat} />
                <Summary
                  label="OT Sun/BH"
                  value={selectedWeek.totals.otSunBh}
                />
              </div>

              <div className="overflow-hidden rounded-lg border border-slate-200">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Date</th>
                      <th className="px-3 py-2">Type</th>
                      <th className="px-3 py-2">Job</th>
                      <th className="px-3 py-2">Times</th>
                      <th className="px-3 py-2">Total</th>
                      <th className="px-3 py-2">Regular</th>
                      <th className="px-3 py-2">OT</th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-100">
                    {selectedWeek.entries.length === 0 ? (
                      <tr>
                        <td className="px-3 py-3 text-slate-500" colSpan={7}>
                          No entries yet.
                        </td>
                      </tr>
                    ) : (
                      selectedWeek.entries.map((entry) => (
                        <tr key={entry.id}>
                          <td className="px-3 py-2">
                            {formatDate(entry.date)}
                          </td>
                          <td className="px-3 py-2">{entry.type}</td>
                          <td className="px-3 py-2">{entry.job || "-"}</td>
                          <td className="px-3 py-2">
                            {entry.startTime || "-"} - {entry.finishTime || "-"}
                          </td>
                          <td className="px-3 py-2">
                            {formatHours(entry.hours)}
                          </td>
                          <td className="px-3 py-2">
                            {formatHours(entry.regularHours)}
                          </td>
                          <td className="px-3 py-2">
                            {formatHours(
                              entry.otMonFriHours +
                                entry.otSatHours +
                                entry.otSunBhHours
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
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
      <div className="text-lg font-semibold">{formatHours(value)}</div>
    </div>
  );
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-GB");
}

function formatHours(value: number) {
  return Number(value || 0).toFixed(2);
}