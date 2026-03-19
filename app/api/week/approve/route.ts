export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const weekId = body?.weekId;
    const action = body?.action; // "APPROVE" | "REJECT"

    if (!weekId || !action) {
      return NextResponse.json(
        { error: "weekId and action are required" },
        { status: 400 }
      );
    }

    const week = await prisma.timesheetWeek.findUnique({
      where: { id: weekId },
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

    const newStatus = action === "APPROVE" ? "APPROVED" : "DRAFT";

    await prisma.timesheetWeek.update({
      where: { id: weekId },
      data: { status: newStatus },
    });

    return NextResponse.json({ ok: true, status: newStatus });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Failed to update week" },
      { status: 500 }
    );
  }
}
