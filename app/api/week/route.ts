export const runtime = "nodejs";

import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { calcWeekTotals } from "@/app/lib/timesheetTotals";

export const dynamic = "force-dynamic";

function getString(v: unknown) {
  return typeof v === "string" ? v.trim() : "";
}

function startOfWeekMonday(d: Date) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

export async function GET(req: Request) {
  try {
    const session = await auth();

    if (!session?.user?.email) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 403 });
    }

    const url = new URL(req.url);
    const weekStartParam = getString(url.searchParams.get("weekStart"));

    const requested =
      weekStartParam && !Number.isNaN(new Date(weekStartParam).getTime())
        ? new Date(`${weekStartParam}T00:00:00`)
        : null;

    const weekStart = requested
      ? startOfWeekMonday(requested)
      : startOfWeekMonday(new Date());

    let existing = await prisma.timesheetWeek.findUnique({
      where: {
        userId_weekStart: {
          userId: user.id,
          weekStart,
        },
      },
      include: {
        entries: {
          orderBy: [{ date: "asc" }, { createdAt: "asc" }],
        },
      },
    });

    if (!existing) {
      existing = await prisma.timesheetWeek.create({
        data: {
          userId: user.id,
          weekStart,
          status: "DRAFT",
        },
        include: {
          entries: {
            orderBy: [{ date: "asc" }, { createdAt: "asc" }],
          },
        },
      });
    }

    const computed = calcWeekTotals(existing.entries as any);

    return NextResponse.json({
      week: existing,
      computed,
      user: {
        id: user.id,
        name: user.name ?? null,
        email: user.email,
      },
    });
  } catch (e: any) {
    console.error("api/week GET error:", e);
    return NextResponse.json(
      { error: e?.message ?? "Failed to load week" },
      { status: 500 }
    );
  }
}
