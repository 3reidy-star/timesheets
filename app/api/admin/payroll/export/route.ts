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

function formatLongDate(date: Date) {
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function formatDay(date: Date) {
  return date.toLocaleDateString("en-GB", { weekday: "long" });
}

function formatTime(value: string | Date | null) {
  if (!value) return "";
  if (value instanceof Date) {
    return value.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }
  return value.trim().slice(0, 5);
}

function dateKey(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function safeFileName(value: string) {
  return value
    .replace(/[^a-z0-9-_]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function num(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function typeLabel(type: string) {
  if (type === "HOLIDAY_FULL") return "Holiday";
  if (type === "HOLIDAY_HALF") return "Half-day holiday";
  if (type === "SICK") return "Sick";
  if (type === "TRAINING") return "Training";
  return "";
}

function applyBorder(cell: ExcelJS.Cell) {
  cell.border = {
    top: { style: "thin", color: { argb: "FF808080" } },
    left: { style: "thin", color: { argb: "FF808080" } },
    bottom: { style: "thin", color: { argb: "FF808080" } },
    right: { style: "thin", color: { argb: "FF808080" } },
  };
}

export async function GET(req: Request) {
  try {
    const session = await auth();

    if (!session?.user?.email) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const requestingUser = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { role: true, active: true },
    });

    if (
      !requestingUser ||
      !requestingUser.active ||
      !["ADMIN", "ACCOUNTS"].includes(requestingUser.role)
    ) {
      return NextResponse.json({ error: "Not authorised" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const from = searchParams.get("from") || "";
    const to = searchParams.get("to") || "";
    const userId = searchParams.get("userId") || "";

    if (!from || !to) {
      return NextResponse.json(
        { error: "From date and to date are required" },
        { status: 400 },
      );
    }

    if (!userId || userId === "all") {
      return NextResponse.json(
        { error: "Select one employee before downloading the payroll report." },
        { status: 400 },
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
      select: { id: true, name: true, email: true },
    });

    if (!employee) {
      return NextResponse.json({ error: "Employee not found" }, { status: 404 });
    }

    const entries = await prisma.timesheetEntry.findMany({
      where: {
        date: { gte: fromDate, lte: toDate },
        week: { userId, status: "APPROVED" },
      },
      include: {
        week: {
          include: {
            audits: {
              where: { action: "APPROVED" },
              orderBy: { createdAt: "desc" },
              take: 1,
              include: {
                performedBy: {
                  select: { name: true, email: true },
                },
              },
            },
          },
        },
      },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    });

    const employeeName =
      employee.name?.trim() || employee.email || "Employee";

    const byDate = new Map<string, typeof entries>();

    for (const entry of entries) {
      const key = dateKey(entry.date);
      const list = byDate.get(key) || [];
      list.push(entry);
      byDate.set(key, list);
    }

    const includedWeeks = new Map<
      string,
      {
        weekStart: Date;
        approvedBy: string;
        approvedAt: Date | null;
      }
    >();

    for (const entry of entries) {
      if (includedWeeks.has(entry.weekId)) continue;

      const audit = entry.week.audits[0];

      includedWeeks.set(entry.weekId, {
        weekStart: entry.week.weekStart,
        approvedBy:
          audit?.performedBy?.name?.trim() ||
          audit?.performedBy?.email ||
          "Approved week status",
        approvedAt: audit?.createdAt || null,
      });
    }

    const approvals = [...includedWeeks.values()].sort(
      (a, b) => a.weekStart.getTime() - b.weekStart.getTime(),
    );

    const approvers = [...new Set(approvals.map((item) => item.approvedBy))];
    const latestApproval = approvals
      .map((item) => item.approvedAt)
      .filter((value): value is Date => Boolean(value))
      .sort((a, b) => b.getTime() - a.getTime())[0];

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Timesheets App";
    workbook.company = "Pastorfrigor GB Ltd";
    workbook.subject = "Approved payroll report";
    workbook.created = new Date();
    workbook.calcProperties.fullCalcOnLoad = true;

    const sheet = workbook.addWorksheet("Payroll Report", {
      pageSetup: {
        orientation: "landscape",
        paperSize: 9,
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        margins: {
          left: 0.25,
          right: 0.25,
          top: 0.4,
          bottom: 0.4,
          header: 0.2,
          footer: 0.2,
        },
      },
    });

    sheet.columns = [
      { width: 13 },
      { width: 13 },
      { width: 11 },
      { width: 11 },
      { width: 13 },
      { width: 13 },
      { width: 12 },
      { width: 13 },
      { width: 13 },
      { width: 44 },
      { width: 13 },
    ];

    sheet.mergeCells("A1:K1");
    sheet.getCell("A1").value = "Pastorfrigor GB Ltd";
    sheet.getCell("A1").font = { bold: true, size: 22 };
    sheet.getRow(1).height = 34;

    const headerPairs = [
      ["Employee:", employeeName],
      ["Payroll Period:", `${formatDate(fromDate)} - ${formatDate(toDate)}`],
      ["Payroll Status:", entries.length ? "APPROVED FOR PAYROLL" : "NO APPROVED ENTRIES"],
      ["Approved By:", approvers.join(", ") || "No approval audit found"],
      ["Latest Approval:", latestApproval ? formatLongDate(latestApproval) : ""],
    ];

    headerPairs.forEach(([label, value], index) => {
      const row = index + 2;
      sheet.mergeCells(`A${row}:B${row}`);
      sheet.getCell(`A${row}`).value = label;
      sheet.getCell(`A${row}`).font = { bold: true };

      sheet.mergeCells(`C${row}:E${row}`);
      sheet.getCell(`C${row}`).value = value;

      if (row <= 4) {
        sheet.getCell(`A${row}`).fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFFFFF00" },
        };
        sheet.getCell(`C${row}`).fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFFFFF00" },
        };
      }
    });

    sheet.getCell("C4").font = {
      bold: true,
      color: { argb: entries.length ? "FF008000" : "FFC00000" },
    };

    sheet.mergeCells("G2:K2");
    sheet.getCell("G2").value = "Payroll Summary";
    sheet.getCell("G2").font = { bold: true, size: 13 };
    sheet.getCell("G2").alignment = { horizontal: "center" };
    sheet.getCell("G2").fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFB4C7E7" },
    };

    const columns = [
      ["Regular Hours", "E"],
      ["OT Mon-Fri", "F"],
      ["OT Saturday", "G"],
      ["OT Sunday / BH", "H"],
      ["Overnight Stays", "I"],
      ["Total Paid Hours", "K"],
    ];

    columns.forEach(([label, letter], index) => {
      const row = index + 3;
      sheet.mergeCells(`G${row}:I${row}`);
      sheet.getCell(`G${row}`).value = label;
      sheet.mergeCells(`J${row}:K${row}`);
      sheet.getCell(`J${row}`).value = {
        formula: `SUM(${letter}10:${letter}100)`,
      };
      sheet.getCell(`J${row}`).numFmt =
        label === "Overnight Stays" ? "0" : "0.00";

      for (const address of [`G${row}`, `J${row}`]) {
        sheet.getCell(address).fill = {
          type: "pattern",
          pattern: "solid",
          fgColor:
            label === "Total Paid Hours"
              ? { argb: "FFB4C7E7" }
              : { argb: "FFF2F2F2" },
        };
      }
    });

    const headers = [
      "Date",
      "Day",
      "Start",
      "Finish",
      "Regular",
      "OT Mon-Fri",
      "OT Sat",
      "OT Sun/BH",
      "Overnight",
      "Site / Job",
      "Total Job Hrs",
    ];

    const headerRow = sheet.getRow(9);
    headerRow.height = 35;

    headers.forEach((header, index) => {
      const cell = headerRow.getCell(index + 1);
      cell.value = header;
      cell.font = { bold: true };
      cell.alignment = {
        horizontal: "center",
        vertical: "middle",
        wrapText: true,
      };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFD9D9D9" },
      };
      applyBorder(cell);
    });

    let rowNumber = 10;
    let cursor = new Date(fromDate);
    cursor.setHours(0, 0, 0, 0);
    const endCursor = new Date(toDate);
    endCursor.setHours(0, 0, 0, 0);

    while (cursor <= endCursor) {
      const daily = byDate.get(dateKey(cursor)) || [];
      const jobs = [
        ...new Set(
          daily
            .map((entry) => {
              const job = entry.job?.trim() || "";
              const description = entry.description?.trim() || "";
              if (job && description) return `${job} - ${description}`;
              return job || description || typeLabel(String(entry.type));
            })
            .filter(Boolean),
        ),
      ].join("\n");

      const starts = daily
        .map((entry) => formatTime(entry.startTime))
        .filter(Boolean);
      const finishes = daily
        .map((entry) => formatTime(entry.finishTime))
        .filter(Boolean);

      const row = sheet.getRow(rowNumber);
      row.values = [
        new Date(cursor),
        formatDay(cursor),
        starts[0] || "",
        finishes.at(-1) || "",
        daily.reduce((sum, entry) => sum + num(entry.regularHours), 0) || "",
        daily.reduce((sum, entry) => sum + num(entry.otMonFriHours), 0) || "",
        daily.reduce((sum, entry) => sum + num(entry.otSatHours), 0) || "",
        daily.reduce((sum, entry) => sum + num(entry.otSunBhHours), 0) || "",
        daily.filter((entry) => entry.overnight).length || "",
        jobs,
        daily.reduce((sum, entry) => sum + num(entry.hours), 0) || "",
      ];

      row.getCell(1).numFmt = "dd/mm/yyyy";
      row.height = Math.max(22, 18 * Math.max(1, daily.length));

      for (let column = 1; column <= 11; column += 1) {
        const cell = row.getCell(column);
        cell.alignment = {
          vertical: "middle",
          horizontal: column === 2 || column === 10 ? "left" : "center",
          wrapText: column === 10,
        };
        applyBorder(cell);
      }

      for (let column = 5; column <= 11; column += 1) {
        row.getCell(column).numFmt = column === 9 ? "0" : "0.00";
      }

      if (cursor.getDay() === 0 || cursor.getDay() === 6) {
        for (let column = 1; column <= 11; column += 1) {
          row.getCell(column).fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFF2F2F2" },
          };
        }
      }

      rowNumber += 1;
      cursor = addDays(cursor, 1);
    }

    const totalsRow = sheet.getRow(rowNumber);
    totalsRow.getCell(1).value = "Period Totals";

    for (const column of [5, 6, 7, 8, 9, 11]) {
      const letter = sheet.getColumn(column).letter;
      totalsRow.getCell(column).value = {
        formula: `SUM(${letter}10:${letter}${rowNumber - 1})`,
      };
      totalsRow.getCell(column).numFmt = column === 9 ? "0" : "0.00";
    }

    for (let column = 1; column <= 11; column += 1) {
      const cell = totalsRow.getCell(column);
      cell.font = { bold: true };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFB4C7E7" },
      };
      cell.alignment = {
        horizontal: column === 1 ? "left" : "center",
        vertical: "middle",
      };
      applyBorder(cell);
    }

    const approvalHeading = rowNumber + 2;
    sheet.mergeCells(`A${approvalHeading}:E${approvalHeading}`);
    sheet.getCell(`A${approvalHeading}`).value = "Approved Weeks Included";
    sheet.getCell(`A${approvalHeading}`).font = { bold: true, size: 12 };
    sheet.getCell(`A${approvalHeading}`).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFD9E2F3" },
    };

    let approvalRow = approvalHeading + 1;

    for (const approval of approvals) {
      sheet.getCell(`A${approvalRow}`).value = "Week commencing";
      sheet.getCell(`B${approvalRow}`).value = approval.weekStart;
      sheet.getCell(`B${approvalRow}`).numFmt = "dd/mm/yyyy";
      sheet.getCell(`C${approvalRow}`).value = "Approved by";
      sheet.getCell(`D${approvalRow}`).value = approval.approvedBy;
      sheet.getCell(`E${approvalRow}`).value = approval.approvedAt
        ? formatLongDate(approval.approvedAt)
        : "Approval date unavailable";
      approvalRow += 1;
    }

    if (approvals.length === 0) {
      sheet.mergeCells(`A${approvalRow}:E${approvalRow}`);
      sheet.getCell(`A${approvalRow}`).value =
        "No approved weeks were found for the selected period.";
      approvalRow += 1;
    }

    sheet.views = [{ state: "frozen", ySplit: 9 }];
    sheet.autoFilter = { from: "A9", to: `K${rowNumber - 1}` };
    sheet.pageSetup.printArea = `A1:K${approvalRow}`;
    sheet.headerFooter.oddFooter =
      "&LPastorfrigor GB Ltd&CPayroll Report&RPage &P of &N";

    const buffer = await workbook.xlsx.writeBuffer();

    const fileName = `payroll-${safeFileName(employeeName)}-${from}-to-${to}.xlsx`;

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
      { status: 500 },
    );
  }
}