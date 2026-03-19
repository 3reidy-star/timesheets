import { Suspense } from "react";
import TimesheetPageClient from "./TimesheetPageClient";

export const dynamic = "force-dynamic";

export default function TimesheetPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-slate-600">Loading…</div>}>
      <TimesheetPageClient />
    </Suspense>
  );
}