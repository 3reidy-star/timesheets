export const runtime = "nodejs";

import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";

export const dynamic = "force-dynamic";

function getString(v: unknown) {
  return typeof v === "string" ? v.trim() : "";
}

export async function POST(req: Request) {
  try {
    const session = await auth();

    if (!session?.user?.email) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const reviewer = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, role: true },
    });

    if (!reviewer) {
      return NextResponse.json({ error: "User not found" }, { status: 403 });
    }

    if (reviewer.role !== "ADMIN" && reviewer.role !== "ACCOUNTS") {
      return NextResponse.json({ error: "Not authorised" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const weekId = getString(body?.weekId);
    const action = getString(body?.action).toUpperCase();

    if (!weekId || !action) {
      return NextResponse.json(
        { error: "weekId and action are required" },
        { status: 400 }
      );
    }

    if (action !== "APPROVE" && action !== "REJECT") {
      return NextResponse.json(
        { error: "action must be APPROVE or REJECT" },
        { status: 400 }
      );
    }

    const week = await prisma.timesheetWeek.findUnique({
      where: { id: weekId },
      select: { id: true, status: true },
    });

    if (!week) {
      return NextResponse.json({ error: "Week not found" }, { status: 404 });
    }

    if (week.status !== "SUBMITTED") {
      return NextResponse.json(
        { error: "Only submitted weeks can be approved/rejected" },
        { status: 400 }
      );
    }

    const newStatus = action === "APPROVE" ? "APPROVED" : "REJECTED";
    const auditAction = action === "APPROVE" ? "APPROVED" : "REJECTED";

    await prisma.$transaction([
      prisma.timesheetWeek.update({
        where: { id: weekId },
        data: { status: newStatus },
      }),
      prisma.weekAudit.create({
        data: {
          weekId,
          action: auditAction as any,
          comment: null,
          performedById: reviewer.id,
        },
      }),
    ]);

    return NextResponse.json({ ok: true, status: newStatus });
  } catch (err: any) {
    console.error("api/week/review error:", err);
    return NextResponse.json(
      { error: err?.message ?? "Failed to update week" },
      { status: 500 }
    );
  }
}