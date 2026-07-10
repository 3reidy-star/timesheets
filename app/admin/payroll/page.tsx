import { auth } from "@/auth";
import { prisma } from "@/app/lib/prisma";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const session = await auth();

  if (!session?.user?.email) {
    redirect("/login");
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: {
      role: true,
      active: true,
    },
  });

  if (!user || !user.active) {
    redirect("/login");
  }

  switch (user.role) {
    case "ADMIN":
      redirect("/admin/timesheets");

    case "ACCOUNTS":
      redirect("/admin/payroll");

    default:
      redirect("/timesheet");
  }
}