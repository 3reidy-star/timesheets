import { Suspense } from "react";
import TimesheetEntryEditPageClient from "./TimesheetEntryEditPageClient";

export const dynamic = "force-dynamic";

export default function TimesheetEntryEditPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-slate-600">Loading…</div>}>
      <TimesheetEntryEditPageClient />
    </Suspense>
  );
}