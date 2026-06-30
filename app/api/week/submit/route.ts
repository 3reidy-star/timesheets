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

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, name: true, email: true, role: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const weekId = getString(body?.weekId);

    if (!weekId) {
      return NextResponse.json({ error: "weekId is required" }, { status: 400 });
    }

    const existing = await prisma.timesheetWeek.findFirst({
      where: { id: weekId, userId: user.id },
      select: { id: true, status: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "Week not found" }, { status: 404 });
    }

    const week = await prisma.$transaction(async (tx) => {
      if (existing.status === "DRAFT") {
        await tx.timesheetWeek.update({
          where: { id: weekId },
          data: { status: "SUBMITTED" },
        });

        await tx.weekAudit.create({
          data: {
            weekId,
            action: "SUBMITTED" as any,
            comment: null,
            performedById: user.id,
          },
        });
      }

      return tx.timesheetWeek.findUnique({
        where: { id: weekId },
        include: {
          entries: {
            orderBy: [{ date: "asc" }, { createdAt: "asc" }],
          },
          audits: {
            orderBy: { createdAt: "asc" },
            include: {
              performedBy: { select: { id: true, name: true, email: true } },
            },
          },
        },
      });
    });

    return NextResponse.json({ ok: true, week });
  } catch (e: any) {
    console.error("submit week error:", e);
    return NextResponse.json(
      { error: e?.message ?? "Failed to submit week" },
      { status: 500 }
    );
  }
}