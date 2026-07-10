export const runtime = "nodejs";

import { auth } from "@/auth";
import { prisma } from "@/app/lib/prisma";
import ExcelJS from "exceljs";
import { NextResponse } from "next/server";

function startOfDay(value: string) {
  return new Date(`${value}T00:00:00`);
}

function endOfDay(value: string) {
  return new Date(`${value}T23:59:59.999`);
}

function formatDate(date: Date) {
  return date.toLocaleDateString("en-GB");
}

function formatDay(date: Date) {
  return date.toLocaleDateString("en-GB", { weekday: "long" });
}

function formatTime(value: string | Date | null) {
  if (!value) return "-";

  if (value instanceof Date) {
    return value.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return value;
}

function safeFileName(value: string) {
  return value.replace(/[^a-z0-9-_]+/gi, "-").replace(/-+/g, "-");
}

export async function GET(req: Request) {
  try {
    const session = await auth();

    if (!session?.user?.email) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const requestingUser = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: {
        role: true,
      },
    });

    if (
      !requestingUser ||
      !["ADMIN", "ACCOUNTS"].includes(requestingUser.role)
    ) {
      return NextResponse.json({ error: "Not authorised" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const from = searchParams.get("from") || "";
    const to = searchParams.get("to") || "";
    const userId = searchParams.get("userId") || "";

    if (!from || !to || !userId) {
      return NextResponse.json(
        { error: "From date, to date and employee are required" },
        { status: 400 }
      );
    }

    const fromDate = startOfDay(from);
    const toDate = endOfDay(to);

    if (
      Number.isNaN(fromDate.getTime()) ||
      Number.isNaN(toDate.getTime()) ||
      fromDate > toDate
    ) {
      return NextResponse.json({ error: "Invalid date range" }, { status: 400 });
    }

    const employee = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        name: true,
        email: true,
      },
    });

    if (!employee) {
      return NextResponse.json({ error: "Employee not found" }, { status: 404 });
    }

    const entries = await prisma.timesheetEntry.findMany({
      where: {
        date: {
          gte: fromDate,
          lte: toDate,
        },
        week: {
          userId,
          status: "APPROVED",
        },
      },
      orderBy: { date: "asc" },
    });

    const totals = entries.reduce(
      (acc, entry) => {
        acc.regular += Number(entry.regularHours || 0);
        acc.otMonFri += Number(entry.otMonFriHours || 0);
        acc.otSat += Number(entry.otSatHours || 0);
        acc.otSunBh += Number(entry.otSunBhHours || 0);
        acc.overnights += entry.overnight ? 1 : 0;
        acc.total += Number(entry.hours || 0);
        return acc;
      },
      {
        regular: 0,
        otMonFri: 0,
        otSat: 0,
        otSunBh: 0,
        overnights: 0,
        total: 0,
      }
    );

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Timesheets App";
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet("Payroll");

    worksheet.addRow(["Accounts Payroll"]);
    worksheet.addRow([
      "Employee",
      employee.name || employee.email,
      "From",
      formatDate(fromDate),
      "To",
      formatDate(toDate),
    ]);
    worksheet.addRow(["Included", "Approved entries only"]);
    worksheet.addRow([]);

    const headerRow = worksheet.addRow([
      "Date",
      "Day",
      "Job / Site",
      "Type",
      "Start",
      "Finish",
      "Regular",
      "OT Mon-Fri",
      "OT Sat",
      "OT Sun/BH",
      "Overnight",
      "Description",
      "Total",
    ]);

    headerRow.font = { bold: true };

    for (const entry of entries) {
      worksheet.addRow([
        formatDate(entry.date),
        formatDay(entry.date),
        entry.job || "-",
        entry.type,
        formatTime(entry.startTime),
        formatTime(entry.finishTime),
        Number(entry.regularHours || 0),
        Number(entry.otMonFriHours || 0),
        Number(entry.otSatHours || 0),
        Number(entry.otSunBhHours || 0),
        entry.overnight ? "Yes" : "",
        entry.description || "-",
        Number(entry.hours || 0),
      ]);
    }

    worksheet.addRow([]);
    const totalsHeader = worksheet.addRow(["Payroll Totals"]);
    totalsHeader.font = { bold: true };

    worksheet.addRow(["Regular Hours", totals.regular]);
    worksheet.addRow(["OT Mon-Fri", totals.otMonFri]);
    worksheet.addRow(["OT Saturday", totals.otSat]);
    worksheet.addRow(["OT Sunday / BH", totals.otSunBh]);
    worksheet.addRow(["Overnight Allowances", totals.overnights]);
    worksheet.addRow(["Total Hours", totals.total]);

    worksheet.columns = [
      { width: 12 },
      { width: 12 },
      { width: 28 },
      { width: 18 },
      { width: 10 },
      { width: 10 },
      { width: 12 },
      { width: 12 },
      { width: 10 },
      { width: 12 },
      { width: 12 },
      { width: 40 },
      { width: 12 },
    ];

    worksheet.views = [{ state: "frozen", ySplit: 5 }];

    const buffer = await workbook.xlsx.writeBuffer();

    const employeeDisplayName =
  employee.name || employee.email || "employee";

const employeeName = safeFileName(employeeDisplayName);
    const fileName = `payroll-${employeeName}-${from}-to-${to}.xlsx`;

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Payroll export failed:", error);

    return NextResponse.json(
      { error: "Failed to export payroll" },
      { status: 500 }
    );
  }
}