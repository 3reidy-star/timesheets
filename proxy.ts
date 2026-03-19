import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/auth";

function isAdminAllowed(role: unknown) {
  return role === "ADMIN" || role === "PAYROLL" || role === "MANAGER";
}

export async function proxy(req: NextRequest) {
  // Dev bypass (until Entra config is ready)
  if (process.env.DEV_AUTH_BYPASS === "1") {
    return NextResponse.next();
  }

  const { pathname } = req.nextUrl;

  // Public routes
  if (
    pathname === "/" ||
    pathname === "/login" ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  const session = await auth();
  if (!session?.user) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(url);
  }

  if (pathname.startsWith("/admin")) {
    const role = (session.user as any).role;
    if (!isAdminAllowed(role)) {
      return NextResponse.redirect(new URL("/timesheet", req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico)).*)",
  ],
};
