import { Suspense } from "react";
import ApprovalAuditPageClient from "./ApprovalAuditPageClient";

export const dynamic = "force-dynamic";

export default function ApprovalAuditPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-slate-600">Loading…</div>}>
      <ApprovalAuditPageClient />
    </Suspense>
  );
}