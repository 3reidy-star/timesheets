export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { auth } from "@/auth";
import { prisma } from "@/app/lib/prisma";
import { NextResponse } from "next/server";

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ weekId: string }> | { weekId: string } }
) {
  try {
    const session = await auth();

    if (!session?.user?.email) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const currentUser = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { role: true, active: true },
    });

    if (!currentUser || !currentUser.active || currentUser.role !== "ADMIN") {
      return NextResponse.json({ error: "Not authorised" }, { status: 403 });
    }

    const p = ctx.params as any;
    const { weekId } =
      typeof p?.then === "function" ? await p : (p as { weekId: string });

    if (!weekId) {
      return NextResponse.json({ error: "Missing week id" }, { status: 400 });
    }

    await prisma.$transaction([
      prisma.weekAudit.deleteMany({ where: { weekId } }),
      prisma.timesheetEntry.deleteMany({ where: { weekId } }),
      prisma.timesheetWeek.delete({ where: { id: weekId } }),
    ]);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Delete admin timesheet week error:", error);
    return NextResponse.json(
      { error: "Failed to delete timesheet week" },
      { status: 500 }
    );
  }
}