"use client";

import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";

export default function LoginPageClient() {
  const sp = useSearchParams();
  const callbackUrl = sp.get("callbackUrl") || "/post-login";

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center p-6">
      <h1 className="text-2xl font-semibold">Sign in</h1>
      <p className="mt-1 text-sm text-slate-600">
        Use your Microsoft account to access the timesheet system.
      </p>

      <button
        type="button"
        onClick={() => signIn("microsoft-entra-id", { callbackUrl })}
        className="mt-6 w-full rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white hover:bg-blue-500"
      >
        Sign in with Microsoft
      </button>
    </main>
  );
}