import { redirect } from "next/navigation";
import { auth } from "@/auth";

export const dynamic = "force-dynamic";

export default async function PostLoginPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const role = (session.user as any).role;

  if (role === "ADMIN" || role === "ACCOUNTS") {
    redirect("/admin/timesheets");
  }

  redirect("/timesheet");
}
