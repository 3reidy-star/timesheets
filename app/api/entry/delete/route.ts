export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";

export const dynamic = "force-dynamic";

function toString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const id = toString(body?.id);
    if (!id) return NextResponse.json({ error: "Missing entry id" }, { status: 400 });

    // ✅ Check week status (NO project)
    const entry = await prisma.timesheetEntry.findUnique({
      where: { id },
      select: {
        id: true,
        week: { select: { status: true } },
      },
    });

    if (!entry) return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    if (entry.week?.status !== "DRAFT") {
      return NextResponse.json({ error: "Week is locked and cannot be edited" }, { status: 400 });
    }

    await prisma.timesheetEntry.delete({ where: { id } });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("api/entry/delete POST error:", e);
    return NextResponse.json({ error: e?.message ?? "Failed to delete entry" }, { status: 500 });
  }
}
