import { auth } from "@/auth";
import { prisma } from "@/app/lib/prisma";
import { redirect } from "next/navigation";
import UserAdminPageClient from "./UserAdminPageClient";

export const dynamic = "force-dynamic";

export default async function UserAdminPage() {
  const session = await auth();

  if (!session?.user?.email) {
    redirect("/login?callbackUrl=/admin/users");
  }

  const currentUser = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, role: true, active: true },
  });

  if (!currentUser || !currentUser.active || currentUser.role !== "ADMIN") {
    redirect("/timesheet");
  }

  const users = await prisma.user.findMany({
    orderBy: [{ active: "desc" }, { role: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      active: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return <UserAdminPageClient users={users} currentUserId={currentUser.id} />;
}