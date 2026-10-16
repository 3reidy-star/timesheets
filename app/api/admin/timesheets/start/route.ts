export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { auth } from "@/auth";
import { prisma } from "@/app/lib/prisma";
import { parsePayrollDate } from "@/app/lib/payrollApproval";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.email) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    const actor = await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true, active: true, role: true } });
    if (!actor?.active || !["ADMIN", "ACCOUNTS"].includes(actor.role)) {
      return NextResponse.json({ error: "Not authorised" }, { status: 403 });
    }
    const body = await request.json().catch(() => ({}));
    const userId = typeof body?.userId === "string" ? body.userId.trim() : "";
    const weekStart = parsePayrollDate(body?.weekStart);
    if (!userId || !weekStart || weekStart.getUTCDay() !== 1) {
      return NextResponse.json({ error: "Select an employee and a valid Monday" }, { status: 400 });
    }
    const employee = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, email: true, active: true } });
    if (!employee?.active) return NextResponse.json({ error: "Active employee not found" }, { status: 404 });
    // Repeated clicks reuse the same employee/week without altering its entries or approvals.
    const week = await prisma.timesheetWeek.upsert({
      where: { userId_weekStart: { userId, weekStart } },
      update: {},
      create: {
        userId, weekStart, status: "DRAFT",
        audits: { create: { action: "CREATED", performedById: actor.id, comment: "Week started by an administrator on behalf of the employee." } },
      },
      select: { id: true, weekStart: true, status: true },
    });
    if (week.status !== "DRAFT") {
      return NextResponse.json({ error: "This week already exists and is not open for entries. Reopen it from Approvals before adding entries." }, { status: 409 });
    }
    return NextResponse.json({ week, employee });
  } catch (error) {
    console.error("Start employee week failed", error);
    return NextResponse.json({ error: "Could not start employee week" }, { status: 500 });
  }
}
