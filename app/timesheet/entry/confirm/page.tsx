import { Suspense } from "react";
import ConfirmEntryPageClient from "./ConfirmEntryPageClient";

export const dynamic = "force-dynamic";

export default function ConfirmEntryPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-slate-600">Loading…</div>}>
      <ConfirmEntryPageClient />
    </Suspense>
  );
}