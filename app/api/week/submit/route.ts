export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";

async function getOrCreateDevUser() {
  const email = process.env.DEV_USER_EMAIL || "craig@test.com";
  const name = process.env.DEV_USER_NAME || "Craig (Dev)";

  const user =
    (await prisma.user.findUnique({ where: { email } })) ??
    (await prisma.user.create({
      data: {
        email,
        name,
        role: "ENGINEER",
      },
    }));

  return user;
}

function getString(v: unknown) {
  return typeof v === "string" ? v.trim() : "";
}

export async function POST(req: Request) {
  try {
    const user = await getOrCreateDevUser();

    const body = await req.json().catch(() => ({}));
    const weekId = getString(body?.weekId);

    if (!weekId) {
      return NextResponse.json({ error: "weekId is required" }, { status: 400 });
    }

    // Ensure this week belongs to the current dev user
    const existing = await prisma.timesheetWeek.findFirst({
      where: { id: weekId, userId: user.id },
      select: { id: true, status: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "Week not found" }, { status: 404 });
    }

    // Idempotent: if already submitted/approved/rejected, just return the week
    if (existing.status !== "DRAFT") {
      const week = await prisma.timesheetWeek.findUnique({
        where: { id: weekId },
        include: {
          entries: {
            // ✅ removed project include (job is already on entry)
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

      return NextResponse.json({ ok: true, week });
    }

    // Submit + audit in one transaction
    const week = await prisma.$transaction(async (tx) => {
      // (Optional) Ensure it still belongs to user in-transaction
      const wk = await tx.timesheetWeek.findFirst({
        where: { id: weekId, userId: user.id },
        select: { id: true, status: true },
      });
      if (!wk) throw new Error("Week not found");
      if (wk.status !== "DRAFT") {
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
      }

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

      return tx.timesheetWeek.findUnique({
        where: { id: weekId },
        include: {
          entries: {
            // ✅ removed project include
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
