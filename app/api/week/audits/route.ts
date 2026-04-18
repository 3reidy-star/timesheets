export const runtime = "nodejs";

import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";

function getString(v: unknown) {
  return typeof v === "string" ? v.trim() : "";
}

export async function GET(req: Request) {
  try {
    const session = await auth();

    if (!session?.user?.email) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: {
        id: true,
        role: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 403 });
    }

    if (user.role !== "ADMIN" && user.role !== "ACCOUNTS") {
      return NextResponse.json(
        { error: "Not authorised to view audit trail" },
        { status: 403 }
      );
    }

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