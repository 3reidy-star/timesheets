export { auth as middleware } from "@/auth";

export const config = {
  matcher: [
    "/timesheet",
    "/timesheet/:path*",
    "/approvals",
    "/approvals/:path*",
  ],
};