export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";

function getString(v: unknown) {
  return typeof v === "string" ? v.trim() : "";
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const weekId = getString(url.searchParams.get("weekId"));

    if (!weekId) {
      return NextResponse.json({ error: "weekId is required" }, { status: 400 });
    }

    const audits = await prisma.weekAudit.findMany({
      where: { weekId },
      orderBy: { createdAt: "asc" },
      include: {
        performedBy: { select: { id: true, name: true, email: true } },
      },
      take: 500,
    });

    return NextResponse.json({ audits });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Failed to load audits" },
      { status: 500 }
    );
  }
}
