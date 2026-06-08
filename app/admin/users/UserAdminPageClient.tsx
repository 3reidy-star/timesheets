"use client";

import { useState } from "react";

type Role = "ENGINEER" | "ACCOUNTS" | "ADMIN";

type UserRow = {
  id: string;
  name: string | null;
  email: string | null;
  role: Role;
  active: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
};

export default function UserAdminPageClient({
  users,
  currentUserId,
}: {
  users: UserRow[];
  currentUserId: string;
}) {
  const [rows, setRows] = useState<UserRow[]>(users);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function updateUser(
    userId: string,
    updates: Partial<Pick<UserRow, "role" | "active">>
  ) {
    setSavingId(userId);
    setMessage("");

    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, ...updates }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "Failed to update user");
      }

      setRows((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, ...data.user } : u))
      );

      setMessage("User updated.");
    } catch (err: any) {
      setMessage(err?.message || "Something went wrong.");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">User Admin</h1>
        <p className="mt-1 text-sm text-slate-600">
          Manage roles and deactivate users without deleting timesheet history.
        </p>
      </div>

      {message ? (
        <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
          {message}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Updated</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100">
            {rows.map((user) => (
              <tr
                key={user.id}
                className={!user.active ? "bg-slate-50 text-slate-400" : ""}
              >
                <td className="px-4 py-3 font-medium">
                  {user.name || "Unnamed user"}
                  {user.id === currentUserId ? (
                    <span className="ml-2 rounded-full bg-blue-50 px-2 py-1 text-xs text-blue-700">
                      You
                    </span>
                  ) : null}
                </td>

                <td className="px-4 py-3 text-slate-600">
                  {user.email || "No email"}
                </td>

                <td className="px-4 py-3">
                  <select
                    value={user.role}
                    disabled={savingId === user.id}
                    onChange={(e) =>
                      updateUser(user.id, { role: e.target.value as Role })
                    }
                    className="rounded-lg border border-slate-300 px-3 py-2"
                  >
                    <option value="ENGINEER">Engineer</option>
                    <option value="ACCOUNTS">Accounts</option>
                    <option value="ADMIN">Admin</option>
                  </select>
                </td>

                <td className="px-4 py-3">
                  <button
                    type="button"
                    disabled={savingId === user.id || user.id === currentUserId}
                    onClick={() => updateUser(user.id, { active: !user.active })}
                    className={`rounded-lg px-3 py-2 font-semibold ${
                      user.active
                        ? "bg-green-100 text-green-700"
                        : "bg-red-100 text-red-700"
                    } disabled:opacity-50`}
                  >
                    {user.active ? "Active" : "Inactive"}
                  </button>
                </td>

                <td className="px-4 py-3 text-slate-500">
                  {new Date(user.updatedAt).toLocaleString("en-GB")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}