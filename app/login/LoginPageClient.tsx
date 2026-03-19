"use client";

import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";

export default function LoginPageClient() {
  const sp = useSearchParams();
  const callbackUrl = sp.get("callbackUrl") || "/timesheet";

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center p-6">
      <h1 className="text-2xl font-semibold">Sign in</h1>
      <p className="mt-1 text-sm text-white/70">
        Use your Microsoft 365 work account.
      </p>

      <button
        type="button"
        onClick={() => signIn("microsoft-entra-id", { callbackUrl })}
        className="mt-6 inline-flex w-full items-center justify-center rounded-lg bg-white px-4 py-3 text-base font-semibold text-[#003358] shadow hover:opacity-95 active:opacity-90"
      >
        Sign in with Microsoft
      </button>
    </main>
  );
}