export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";

export async function GET() {
  try {
    // Latest REJECTED audit per week (most recent rejection first)
    const latestRejects = await prisma.weekAudit.findMany({
      where: { action: "REJECTED" },
      orderBy: { createdAt: "desc" },
      distinct: ["weekId"],
      include: {
        performedBy: { select: { id: true, name: true, email: true } },
        week: {
          select: {
            id: true,
            weekStart: true,
            status: true, // after reject this will be DRAFT
            user: { select: { id: true, name: true, email: true } },
            entries: { select: { hours: true } },
          },
        },
      },
      take: 200,
    });

    const weeks = latestRejects
      .filter((a) => a.week)
      .map((a) => {
        const w = a.week!;
        const totalHours = (w.entries ?? []).reduce(
          (sum, e) => sum + (Number(e.hours) || 0),
          0
        );

        return {
          weekId: w.id,
          weekStart: w.weekStart,
          status: w.status,
          totalHours: Math.round(totalHours * 100) / 100,
          user: w.user,
          rejectedAt: a.createdAt,
          rejectedBy: a.performedBy,
          comment: a.comment ?? null,
        };
      });

    return NextResponse.json({ ok: true, weeks });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Failed to load rejected weeks" },
      { status: 500 }
    );
  }
}
