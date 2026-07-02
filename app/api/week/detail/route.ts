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

    const currentUser = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
      },
    });

    if (!currentUser) {
      return NextResponse.json({ error: "User not found" }, { status: 403 });
    }

    const url = new URL(req.url);
    const weekId = getString(url.searchParams.get("weekId"));
    const weekStartParam = getString(url.searchParams.get("weekStart"));

    let existing;

    if (weekId) {
      if (currentUser.role !== "ADMIN" && currentUser.role !== "ACCOUNTS") {
        return NextResponse.json({ error: "Not authorised" }, { status: 403 });
      }

      existing = await prisma.timesheetWeek.findUnique({
        where: { id: weekId },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          entries: {
            orderBy: [{ date: "asc" }, { createdAt: "asc" }],
          },
        },
      });

      if (!existing) {
        return NextResponse.json({ error: "Week not found" }, { status: 404 });
      }
    } else {
      const requested =
        weekStartParam && !Number.isNaN(new Date(weekStartParam).getTime())
          ? new Date(`${weekStartParam}T00:00:00`)
          : null;

      const weekStart = requested
        ? startOfWeekMonday(requested)
        : startOfWeekMonday(new Date());

      existing = await prisma.timesheetWeek.findUnique({
        where: {
          userId_weekStart: {
            userId: currentUser.id,
            weekStart,
          },
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          entries: {
            orderBy: [{ date: "asc" }, { createdAt: "asc" }],
          },
        },
      });

      if (!existing) {
        existing = await prisma.timesheetWeek.create({
          data: {
            userId: currentUser.id,
            weekStart,
            status: "DRAFT",
          },
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
            entries: {
              orderBy: [{ date: "asc" }, { createdAt: "asc" }],
            },
          },
        });
      }
    }

    const computed = calcWeekTotals(existing.entries);

    return NextResponse.json({
      week: existing,
      computed,
      user: existing.user ?? {
        id: currentUser.id,
        name: currentUser.name ?? null,
        email: currentUser.email,
      },
    });
  } catch (e: any) {
    console.error("api/week/detail GET error:", e);
    return NextResponse.json(
      { error: e?.message ?? "Failed to load week detail" },
      { status: 500 }
    );
  }
}
