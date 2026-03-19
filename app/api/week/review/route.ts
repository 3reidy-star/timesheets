export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";

function getString(v: unknown) {
  return typeof v === "string" ? v.trim() : "";
}

async function getDevUser() {
  const email = process.env.DEV_USER_EMAIL || "craig@test.com";

  const user =
    (await prisma.user.findUnique({ where: { email } })) ??
    (await prisma.user.create({
      data: { email, name: "Dev Reviewer", role: "ADMIN" },
    }));

  return user;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const weekId = getString(body?.weekId);
    const action = getString(body?.action).toUpperCase(); // APPROVE | REJECT
    const commentRaw = getString(body?.comment);
    const comment = commentRaw ? commentRaw : null;

    if (!weekId) {
      return NextResponse.json({ error: "weekId is required" }, { status: 400 });
    }

    if (action !== "APPROVE" && action !== "REJECT") {
      return NextResponse.json(
        { error: "action must be APPROVE or REJECT" },
        { status: 400 }
      );
    }

    // Strongly recommended: require reason on rejection
    if (action === "REJECT" && !comment) {
      return NextResponse.json(
        { error: "Comment is required when rejecting a week." },
        { status: 400 }
      );
    }

    const reviewer = await getDevUser();

    const week = await prisma.timesheetWeek.findUnique({
      where: { id: weekId },
      select: { id: true, status: true },
    });

    if (!week) {
      return NextResponse.json({ error: "Week not found" }, { status: 404 });
    }

    if (week.status !== "SUBMITTED") {
      return NextResponse.json(
        { error: `Week is ${week.status} and cannot be reviewed.` },
        { status: 400 }
      );
    }

    // ✅ Policy:
    // - approve locks
    // - reject returns to draft for editing
    const newStatus = action === "APPROVE" ? "APPROVED" : "DRAFT";
    const auditAction = action === "APPROVE" ? "APPROVED" : "REJECTED";

    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.timesheetWeek.update({
        where: { id: weekId },
        data: { status: newStatus },
        select: { id: true, status: true, weekStart: true },
      });

      await tx.weekAudit.create({
        data: {
          weekId,
          action: auditAction as any,
          comment,
          performedById: reviewer.id,
        },
      });

      return updated;
    });

    return NextResponse.json({ ok: true, week: result });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Failed to review week" },
      { status: 500 }
    );
  }
}
