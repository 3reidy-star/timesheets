export const runtime = "nodejs";

import { auth } from "@/auth";
import { prisma } from "@/app/lib/prisma";
import { calcWeekTotals } from "@/app/lib/timesheetTotals";
import ExcelJS from "exceljs";
import { NextResponse } from "next/server";

function startOfDay(value: string) { return new Date(`${value}T00:00:00`); }
function endOfDay(value: string) { return new Date(`${value}T23:59:59.999`); }
function addDays(dateInput: Date, days: number) { const date = new Date(dateInput); date.setDate(date.getDate() + days); return date; }
function fridayOfWeek(weekStart: Date) { return addDays(weekStart, 4); }
function normaliseName(value: string | null | undefined) { return (value || "").trim().replace(/\s+/g, " ").toLowerCase(); }
function splitName(value: string | null | undefined) { const clean = (value || "").trim().replace(/\s+/g, " "); if (!clean) return { firstName: "", surname: "" }; const parts = clean.split(" "); return { firstName: parts[0] || "", surname: parts.slice(1).join(" ") }; }
function round2(value: number) { return Math.round(value * 100) / 100; }
function safeName(value: string) { return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "employee"; }

const PAYROLL_METADATA: Record<string, { payrollNumber?: number; title?: string; basicHours?: boolean }> = {
  "mark brooker": { payrollNumber: 49, title: "Mr" }, "phil jackson": { payrollNumber: 53, title: "Mr" },
  "dean smith": { payrollNumber: 45, title: "Mr" }, "vadim batranac": { payrollNumber: 55, title: "Mr" },
  "vadim bartinac": { payrollNumber: 55, title: "Mr" }, "kostiantyn serohin": { payrollNumber: 60, title: "Mr" },
  "kostantin serohin": { payrollNumber: 60, title: "Mr" }, "daniel giles": { payrollNumber: 64, title: "Mr" },
  "dan giles": { payrollNumber: 64, title: "Mr" }, "david bowring": { payrollNumber: 67, title: "Mr" },
  "dave bowring": { payrollNumber: 67, title: "Mr" }, "ed hutchings": { payrollNumber: 75, title: "Mr" },
  "alex smith": { basicHours: true },
};

export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.email) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    const requestingUser = await prisma.user.findUnique({ where: { email: session.user.email }, select: { role: true, active: true } });
    if (!requestingUser || !requestingUser.active || !["ADMIN", "ACCOUNTS"].includes(requestingUser.role)) return NextResponse.json({ error: "Not authorised" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const from = searchParams.get("from") || ""; const to = searchParams.get("to") || ""; const userId = searchParams.get("userId") || "all";
    if (!from || !to) return NextResponse.json({ error: "From date and to date are required" }, { status: 400 });
    const fromDate = startOfDay(from); const toDate = endOfDay(to);
    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime()) || fromDate > toDate) return NextResponse.json({ error: "Invalid date range" }, { status: 400 });

    const users = await prisma.user.findMany({ where: { active: true, ...(userId === "all" ? {} : { id: userId }) }, orderBy: { name: "asc" }, select: { id: true, name: true, email: true } });
    if (userId !== "all" && users.length === 0) return NextResponse.json({ error: "Employee not found" }, { status: 404 });
    const userIds = users.map((user) => user.id); const weekSearchStart = addDays(fromDate, -6);
    const weeks = userIds.length ? await prisma.timesheetWeek.findMany({ where: { userId: { in: userIds }, status: "APPROVED", weekStart: { gte: weekSearchStart, lte: toDate } }, include: { entries: { orderBy: [{ date: "asc" }, { createdAt: "asc" }] } }, orderBy: [{ userId: "asc" }, { weekStart: "asc" }] }) : [];
    const weeksByUser = new Map<string, typeof weeks>();
    for (const week of weeks) weeksByUser.set(week.userId, [...(weeksByUser.get(week.userId) || []), week]);

    const workbook = new ExcelJS.Workbook(); workbook.creator = "Timesheets App"; workbook.company = "Pastorfrigor GB Ltd"; workbook.subject = "Payroll summary"; workbook.created = new Date();
    const sheet = workbook.addWorksheet("Sheet1");
    sheet.columns = [{ width: 12 }, { width: 8 }, { width: 16 }, { width: 18 }, { width: 3 }, { width: 15 }, { width: 23 }, { width: 24 }, { width: 22 }, { width: 19 }, { width: 17 }, { width: 10 }];
    sheet.addRow(["Payroll #", "In", "First name", "Surname", "", "Basic hours", "Overtime (Mon-Sat)", "Overtime (Saturday)", "Overtime (Sunday)", "Overnight stays", "Holiday uplift", ""]);
    sheet.addRow(["", "", "", "", "", "", "Hours", "Hours", "Hours", "Nights", "Days", "Rate"]);
    sheet.getRow(1).font = { bold: true, size: 12 }; sheet.getRow(2).font = { bold: true, size: 11 }; sheet.getRow(1).height = 22; sheet.getRow(2).height = 20;
    for (let column = 1; column <= 12; column += 1) { sheet.getRow(1).getCell(column).alignment = { vertical: "middle" }; sheet.getRow(2).getCell(column).alignment = { horizontal: "center", vertical: "middle" }; }

    for (const user of users) {
      const employeeWeeks = weeksByUser.get(user.id) || []; const employeeName = user.name?.trim() || user.email || ""; const metadata = PAYROLL_METADATA[normaliseName(employeeName)] || {}; const { firstName, surname } = splitName(employeeName);
      let regularHours = 0, weekdayOvertime = 0, saturdayOvertime = 0, sundayOvertime = 0, overnightStays = 0, holidayDays = 0;
      for (const week of employeeWeeks) {
        const computed = calcWeekTotals(week.entries);
        for (const day of computed.days) {
          const dayDate = startOfDay(day.date); if (dayDate < fromDate || dayDate > toDate) continue;
          regularHours += Number(day.regularHours || 0); weekdayOvertime += Number(day.otMonFriHours || 0); saturdayOvertime += Number(day.otSatHours || 0); sundayOvertime += Number(day.otSunBhHours || 0); overnightStays += Number(day.overnightCount || 0);
          for (const entry of day.entries) { if (entry.type === "HOLIDAY_FULL") holidayDays += 1; if (entry.type === "HOLIDAY_HALF") holidayDays += 0.5; }
        }
        const topUpDate = fridayOfWeek(week.weekStart); if (topUpDate >= fromDate && topUpDate <= toDate) weekdayOvertime += Number(computed.totals.businessTopUpHours || 0);
      }
      const basicHours = metadata.basicHours ? round2(regularHours) : null;
      const row = sheet.addRow([metadata.payrollNumber ?? null, metadata.title || null, firstName || null, surname || null, null, basicHours && basicHours !== 0 ? basicHours : null, weekdayOvertime ? round2(weekdayOvertime) : null, saturdayOvertime ? round2(saturdayOvertime) : null, sundayOvertime ? round2(sundayOvertime) : null, overnightStays || null, holidayDays ? round2(holidayDays) : null, null]);
      row.getCell(1).numFmt = "0"; for (const column of [6, 7, 8, 9, 11]) row.getCell(column).numFmt = "0.##"; row.getCell(10).numFmt = "0";
    }
    sheet.views = [{ state: "frozen", ySplit: 2 }];
    const buffer = await workbook.xlsx.writeBuffer(); const suffix = userId === "all" ? "all-employees" : safeName(users[0]?.name || "employee"); const filename = `timesheet-summary-${from}-to-${to}-${suffix}.xlsx`;
    return new NextResponse(buffer, { status: 200, headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${filename}"`, "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Payroll summary export failed", error); return NextResponse.json({ error: "Could not create payroll summary export" }, { status: 500 });
  }
}
