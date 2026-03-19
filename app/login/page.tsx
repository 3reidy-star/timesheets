import { Suspense } from "react";
import LoginPageClient from "./LoginPageClient";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-slate-600">Loading…</div>}>
      <LoginPageClient />
    </Suspense>
  );
}