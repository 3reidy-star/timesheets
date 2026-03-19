import { Suspense } from "react";
import TimesheetEntryPageClient from "./TimesheetEntryPageClient";

export const dynamic = "force-dynamic";

export default function TimesheetEntryPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-slate-600">Loading…</div>}>
      <TimesheetEntryPageClient />
    </Suspense>
  );
}