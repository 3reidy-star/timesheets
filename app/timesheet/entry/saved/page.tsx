import { Suspense } from "react";
import TimesheetEntrySavedPageClient from "./TimesheetEntrySavedPageClient";

export const dynamic = "force-dynamic";

export default function TimesheetEntrySavedPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-slate-600">Loading…</div>}>
      <TimesheetEntrySavedPageClient />
    </Suspense>
  );
}