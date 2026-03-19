export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const p = (ctx as any).params;
    const { id } =
      typeof (p as any)?.then === "function"
        ? await (p as Promise<{ id: string }>)
        : (p as { id: string });

    if (!id || typeof id !== "string") {
      return NextResponse.json({ error: "Missing entry id" }, { status: 400 });
    }

    const entry = await prisma.timesheetEntry.findUnique({
      where: { id },
      select: {
        id: true,
        weekId: true,
        userId: true,
        week: {
          select: {
            id: true,
            status: true,
            weekStart: true,
          },
        },
        date: true,
        type: true,
        job: true,
        description: true,
        hours: true,
        startTime: true,
        finishTime: true,
        regularHours: true,
        otMonFriHours: true,
        otSatHours: true,
        otSunBhHours: true,
        overnight: true,
        leftEarlyByChoice: true,
        agreedRate: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!entry) {
      return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    }

    return NextResponse.json({ entry });
  } catch (e: any) {
    console.error("api/entry/[id] GET error:", e);
    return NextResponse.json(
      { error: e?.message ?? "Failed to load entry" },
      { status: 500 }
    );
  }
}