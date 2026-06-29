import { prisma } from "@/app/lib/prisma";

function startOfMonth(month: string) {
  return new Date(`${month}-01T00:00:00`);
}

function endOfMonth(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(year, monthNumber, 0, 23, 59, 59);
}

function formatDate(date: Date) {
  return date.toLocaleDateString("en-GB");
}

function formatDay(date: Date) {
  return date.toLocaleDateString("en-GB", { weekday: "long" });
}

function formatTime(value: string | Date | null) {
  if (!value) return "-";

  if (value instanceof Date) {
    return value.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return value;
}

export default async function AdminPayrollPage({
  searchParams,
}: {
  searchParams: Promise<{
    month?: string;
    userId?: string;
  }>;
}) {
  const params = await searchParams;

  const today = new Date();
  const defaultMonth = `${today.getFullYear()}-${String(
    today.getMonth() + 1
  ).padStart(2, "0")}`;

  const selectedMonth = params.month || defaultMonth;
  const selectedUserId = params.userId || "";

  const users = await prisma.user.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      email: true,
    },
  });

  const selectedUser = selectedUserId
    ? users.find((user) => user.id === selectedUserId)
    : null;

  const entries = selectedUserId
    ? await prisma.timesheetEntry.findMany({
        where: {
          date: {
            gte: startOfMonth(selectedMonth),
            lte: endOfMonth(selectedMonth),
          },
          week: {
            userId: selectedUserId,
            status: "APPROVED",
          },
        },
        orderBy: { date: "asc" },
        include: {
          week: {
            include: {
              user: true,
            },
          },
        },
      })
    : [];

  const totals = entries.reduce(
    (acc, entry) => {
      acc.regular += Number(entry.regularHours || 0);
      acc.otMonFri += Number(entry.otMonFriHours || 0);
      acc.otSat += Number(entry.otSatHours || 0);
      acc.otSunBh += Number(entry.otSunBhHours || 0);
      acc.overnights += entry.overnight ? 1 : 0;
      acc.total += Number(entry.hours || 0);
      return acc;
    },
    {
      regular: 0,
      otMonFri: 0,
      otSat: 0,
      otSunBh: 0,
      overnights: 0,
      total: 0,
    }
  );

  return (
    <main className="p-6 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Accounts Payroll</h1>
          <p className="text-sm text-gray-600">
            Monthly approved timesheet summary for payroll processing.
          </p>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            disabled
            className="rounded border px-4 py-2 text-sm font-medium text-gray-400"
          >
            Download Excel
          </button>

          <button
            type="button"
            disabled
            className="rounded border px-4 py-2 text-sm font-medium text-gray-400"
          >
            Download PDF
          </button>
        </div>
      </div>

      <form className="flex flex-wrap gap-4 rounded-lg border bg-white p-4">
        <div>
          <label className="block text-sm font-medium">Month</label>
          <input
            type="month"
            name="month"
            defaultValue={selectedMonth}
            className="mt-1 rounded border p-2"
          />
        </div>

        <div>
          <label className="block text-sm font-medium">Employee</label>
          <select
            name="userId"
            defaultValue={selectedUserId}
            className="mt-1 min-w-[260px] rounded border p-2"
          >
            <option value="">Select employee</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name || user.email}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-end">
          <button
            type="submit"
            className="rounded bg-black px-4 py-2 text-sm font-medium text-white"
          >
            View
          </button>
        </div>
      </form>

      {selectedUser && (
        <section className="rounded-lg border bg-white p-4">
          <div className="grid gap-2 text-sm md:grid-cols-3">
            <div>
              <span className="font-medium">Employee:</span>{" "}
              {selectedUser.name || selectedUser.email}
            </div>
            <div>
              <span className="font-medium">Month:</span> {selectedMonth}
            </div>
            <div>
              <span className="font-medium">Included:</span> Approved weeks only
            </div>
          </div>
        </section>
      )}

      <section className="overflow-x-auto rounded-lg border bg-white">
        <table className="w-full min-w-[1200px] text-sm">
          <thead className="bg-gray-50 text-left">
            <tr>
              <th className="p-3">Date</th>
              <th className="p-3">Day</th>
              <th className="p-3">Job / Site</th>
              <th className="p-3">Type</th>
              <th className="p-3">Start</th>
              <th className="p-3">Finish</th>
              <th className="p-3">Regular</th>
              <th className="p-3">OT Mon-Fri</th>
              <th className="p-3">OT Sat</th>
              <th className="p-3">OT Sun/BH</th>
              <th className="p-3">Overnight</th>
              <th className="p-3">Description</th>
              <th className="p-3">Total</th>
            </tr>
          </thead>

          <tbody>
            {entries.map((entry) => (
              <tr key={entry.id} className="border-t align-top">
                <td className="p-3">{formatDate(entry.date)}</td>
                <td className="p-3">{formatDay(entry.date)}</td>
                <td className="p-3 font-medium">{entry.job || "-"}</td>
                <td className="p-3">{entry.type}</td>
                <td className="p-3">{formatTime(entry.startTime)}</td>
                <td className="p-3">{formatTime(entry.finishTime)}</td>
                <td className="p-3">
                  {Number(entry.regularHours || 0).toFixed(2)}
                </td>
                <td className="p-3">
                  {Number(entry.otMonFriHours || 0).toFixed(2)}
                </td>
                <td className="p-3">
                  {Number(entry.otSatHours || 0).toFixed(2)}
                </td>
                <td className="p-3">
                  {Number(entry.otSunBhHours || 0).toFixed(2)}
                </td>
                <td className="p-3">{entry.overnight ? "Yes" : ""}</td>
                <td className="p-3 text-gray-600">
                  {entry.description || "-"}
                </td>
                <td className="p-3 font-medium">
                  {Number(entry.hours || 0).toFixed(2)}
                </td>
              </tr>
            ))}

            {entries.length === 0 && (
              <tr>
                <td className="p-6 text-gray-500" colSpan={13}>
                  {selectedUserId
                    ? "No approved entries found for this employee and month."
                    : "Select an employee to view payroll data."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="rounded-lg border bg-white p-4">
        <h2 className="mb-3 text-lg font-semibold">Payroll Totals</h2>

        <div className="grid gap-3 text-sm md:grid-cols-3">
          <div className="rounded border p-3">
            <div className="text-gray-500">Regular Hours</div>
            <div className="text-xl font-bold">{totals.regular.toFixed(2)}</div>
          </div>

          <div className="rounded border p-3">
            <div className="text-gray-500">OT Mon-Fri</div>
            <div className="text-xl font-bold">{totals.otMonFri.toFixed(2)}</div>
          </div>

          <div className="rounded border p-3">
            <div className="text-gray-500">OT Saturday</div>
            <div className="text-xl font-bold">{totals.otSat.toFixed(2)}</div>
          </div>

          <div className="rounded border p-3">
            <div className="text-gray-500">OT Sunday / BH</div>
            <div className="text-xl font-bold">{totals.otSunBh.toFixed(2)}</div>
          </div>

          <div className="rounded border p-3">
            <div className="text-gray-500">Overnight Allowances</div>
            <div className="text-xl font-bold">{totals.overnights}</div>
          </div>

          <div className="rounded border p-3">
            <div className="text-gray-500">Total Hours</div>
            <div className="text-xl font-bold">{totals.total.toFixed(2)}</div>
          </div>
        </div>
      </section>
    </main>
  );
}