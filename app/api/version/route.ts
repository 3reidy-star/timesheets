import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Public deployment identifier only: no database, user data or credentials.
export async function GET() {
  return NextResponse.json({
    release: "day-approval-runtime-repair",
    commit: process.env.VERCEL_GIT_COMMIT_SHA || null,
  }, { headers: { "Cache-Control": "no-store" } });
}
