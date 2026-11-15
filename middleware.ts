import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const destination = "https://app.pfgbltd.com";

function movedPath(pathname: string) {
  if (pathname === "/timesheet" || pathname === "/") return "/timesheets";
  if (pathname.startsWith("/timesheet/")) return "/timesheets" + pathname.slice("/timesheet".length);
  if (["/entry", "/admin", "/approvals"].some(prefix => pathname === prefix || pathname.startsWith(prefix + "/"))) return "/timesheets" + pathname;
  return "/timesheets";
}

export function middleware(request: NextRequest) {
  const mode = process.env.TIMESHEETS_CUTOVER_MODE;
  if (mode !== "freeze" && mode !== "moved") return NextResponse.next();
  const pathname = request.nextUrl.pathname;
  const isApiOrWrite = pathname.startsWith("/api/") || request.headers.has("next-action") || !["GET", "HEAD"].includes(request.method);
  if (isApiOrWrite) {
    return NextResponse.json({ error: mode === "freeze" ? "Timesheets are being moved. Please try again shortly." : "Timesheets have moved. Open Timesheets from the PFGB app before entering or approving records.", url: destination + "/timesheets" }, { status: mode === "freeze" ? 503 : 410, headers: { "Cache-Control": "no-store", ...(mode === "freeze" ? { "Retry-After": "120" } : {}) } });
  }
  if (mode === "moved") {
    const url = new URL(movedPath(pathname), destination);
    // Authentication codes and tokens from the retired app never cross to the new app.
    if (pathname !== "/login" && !pathname.startsWith("/api/")) url.search = request.nextUrl.search;
    const response = NextResponse.redirect(url, 307);
    response.headers.set("Cache-Control", "no-store");
    return response;
  }
  return new NextResponse('<!doctype html><html lang="en"><meta charset="utf-8"><title>Timesheets maintenance</title><main style="max-width:40rem;margin:10vh auto;padding:2rem;font-family:Arial,sans-serif"><h1>Timesheets are being moved</h1><p>Entries and approvals are temporarily paused while we transfer the latest records to the PFGB app. Please try again shortly.</p></main></html>', { status: 503, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Retry-After": "120" } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
