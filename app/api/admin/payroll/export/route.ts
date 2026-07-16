export const runtime = "nodejs";

import { auth } from "@/auth";
import { prisma } from "@/app/lib/prisma";
import { calcWeekTotals } from "@/app/lib/timesheetTotals";
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
  return date.toLocaleDateString("en-GB", {
    weekday: "long",
  });
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

function safeFileName(value: string) {
  return value
    .replace(/[^a-z0-9-_]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function dateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function addDays(dateInput: Date, days: number) {
  const date = new Date(dateInput);
  date.setDate(date.getDate() + days);
  return date;
}

function fridayOfWeek(weekStart: Date) {
  return addDays(weekStart, 4);
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
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 },
      );
    }

    const requestingUser = await prisma.user.findUnique({
      where: {
        email: session.user.email,
      },
      select: {
        role: true,
        active: true,
      },
    });

    if (
      !requestingUser ||
      !requestingUser.active ||
      !["ADMIN", "ACCOUNTS"].includes(requestingUser.role)
    ) {
      return NextResponse.json(
        { error: "Not authorised" },
        { status: 403 },
      );
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
        {
          error:
            "Select one employee before downloading the payroll report.",
        },
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
      return NextResponse.json(
        { error: "Invalid date range" },
        { status: 400 },
      );
    }

    const employee = await prisma.user.findUnique({
      where: {
        id: userId,
      },
      select: {
        id: true,
        name: true,
        email: true,
      },
    });

    if (!employee) {
      return NextResponse.json(
        { error: "Employee not found" },
        { status: 404 },
      );
    }

    /*
     * Load complete approved weeks overlapping the selected period.
     * The full week is required because calcWeekTotals applies weekly
     * payroll rules, including the business top-up.
     */
    const weekSearchStart = addDays(fromDate, -6);

    const weeks = await prisma.timesheetWeek.findMany({
      where: {
        userId,
        status: "APPROVED",
        weekStart: {
          gte: weekSearchStart,
          lte: toDate,
        },
      },
      include: {
        entries: {
          orderBy: [
            {
              date: "asc",
            },
            {
              createdAt: "asc",
            },
          ],
        },
        audits: {
          where: {
            action: "APPROVED",
          },
          orderBy: {
            createdAt: "desc",
          },
          take: 1,
          include: {
            performedBy: {
              select: {
                name: true,
                email: true,
              },
            },
          },
        },
      },
      orderBy: {
        weekStart: "asc",
      },
    });

    const employeeName =
      employee.name?.trim() || employee.email || "Employee";

    const entriesByDate = new Map<
      string,
      (typeof weeks)[number]["entries"]
    >();

    const computedDayByDate = new Map<
      string,
      ReturnType<typeof calcWeekTotals>["days"][number]
    >();

    const businessTopUpByDate = new Map<string, number>();

    let periodRegular = 0;
    let periodOtMonFri = 0;
    let periodOtSat = 0;
    let periodOtSunBh = 0;
    let periodBusinessTopUp = 0;
    let periodOvernights = 0;
    let periodPaid = 0;

    const approvalRows: {
      weekStart: Date;
      approvedBy: string;
      approvedAt: Date | null;
      businessTopUp: number;
      paidHours: number;
    }[] = [];

    for (const week of weeks) {
      const computed = calcWeekTotals(week.entries);

      for (const entry of week.entries) {
        if (entry.date < fromDate || entry.date > toDate) continue;

        const key = dateKey(entry.date);
        const current = entriesByDate.get(key) || [];

        current.push(entry);
        entriesByDate.set(key, current);
      }

      for (const day of computed.days) {
        const dayDate = startOfDay(day.date);

        if (dayDate < fromDate || dayDate > toDate) continue;

        computedDayByDate.set(day.date, day);

        periodRegular += Number(day.regularHours || 0);
        periodOtMonFri += Number(day.otMonFriHours || 0);
        periodOtSat += Number(day.otSatHours || 0);
        periodOtSunBh += Number(day.otSunBhHours || 0);
        periodOvernights += Number(day.overnightCount || 0);
        periodPaid += Number(day.paidHours || 0);
      }

      /*
       * Put each weekly business top-up on Friday. This gives the top-up a
       * single payroll-period owner where a week crosses the 16th/15th boundary.
       */
      const topUpDate = fridayOfWeek(week.weekStart);
      const topUp = Number(computed.totals.businessTopUpHours || 0);

      if (topUpDate >= fromDate && topUpDate <= toDate && topUp > 0) {
        const key = dateKey(topUpDate);

        businessTopUpByDate.set(
          key,
          Number(businessTopUpByDate.get(key) || 0) + topUp,
        );

        periodBusinessTopUp += topUp;
        periodPaid += topUp;
      }

      const audit = week.audits[0];

      approvalRows.push({
        weekStart: week.weekStart,
        approvedBy:
          audit?.performedBy?.name?.trim() ||
          audit?.performedBy?.email ||
          "Approved week status",
        approvedAt: audit?.createdAt || null,
        businessTopUp: topUp,
        paidHours: Number(computed.totals.paidHours || 0),
      });
    }

    const approvers = [
      ...new Set(approvalRows.map((item) => item.approvedBy)),
    ];

    const latestApproval = approvalRows
      .map((item) => item.approvedAt)
      .filter((value): value is Date => Boolean(value))
      .sort((a, b) => b.getTime() - a.getTime())[0];

    const workbook = new ExcelJS.Workbook();

    workbook.creator = "Timesheets App";
    workbook.company = "Pastorfrigor GB Ltd";
    workbook.subject = "Approved payroll report";
    workbook.created = new Date();

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
      { width: 12 },
      { width: 12 },
      { width: 12 },
      { width: 12 },
      { width: 14 },
      { width: 12 },
      { width: 42 },
      { width: 13 },
    ];

    sheet.mergeCells("A1:L1");
    sheet.getCell("A1").value = "Pastorfrigor GB Ltd";
    sheet.getCell("A1").font = {
      bold: true,
      size: 22,
    };
    sheet.getRow(1).height = 34;

    const headerPairs = [
      ["Employee:", employeeName],
      [
        "Payroll Period:",
        `${formatDate(fromDate)} - ${formatDate(toDate)}`,
      ],
      [
        "Payroll Status:",
        weeks.length > 0
          ? "APPROVED FOR PAYROLL"
          : "NO APPROVED WEEKS",
      ],
      [
        "Approved By:",
        approvers.join(", ") || "No approval audit found",
      ],
      [
        "Latest Approval:",
        latestApproval ? formatLongDate(latestApproval) : "",
      ],
    ];

    headerPairs.forEach(([label, value], index) => {
      const row = index + 2;

      sheet.mergeCells(`A${row}:B${row}`);
      sheet.getCell(`A${row}`).value = label;
      sheet.getCell(`A${row}`).font = {
        bold: true,
      };

      sheet.mergeCells(`C${row}:E${row}`);
      sheet.getCell(`C${row}`).value = value;

      if (row <= 4) {
        for (const address of [`A${row}`, `C${row}`]) {
          sheet.getCell(address).fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: {
              argb: "FFFFFF00",
            },
          };
        }
      }
    });

    sheet.getCell("C4").font = {
      bold: true,
      color: {
        argb: weeks.length > 0 ? "FF008000" : "FFC00000",
      },
    };

    sheet.mergeCells("G2:L2");
    sheet.getCell("G2").value = "Payroll Summary";
    sheet.getCell("G2").font = {
      bold: true,
      size: 13,
    };
    sheet.getCell("G2").alignment = {
      horizontal: "center",
    };
    sheet.getCell("G2").fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: {
        argb: "FFB4C7E7",
      },
    };

    const summaryRows: Array<[string, number, boolean?]> = [
      ["Regular Hours", periodRegular],
      ["OT Mon-Fri", periodOtMonFri],
      ["OT Saturday", periodOtSat],
      ["OT Sunday / BH", periodOtSunBh],
      ["Business Top-Up", periodBusinessTopUp],
      ["Overnight Stays", periodOvernights, true],
      ["Total Paid Hours", periodPaid],
    ];

    summaryRows.forEach(([label, value, wholeNumber], index) => {
      const row = index + 3;
      const isTotal = label === "Total Paid Hours";

      sheet.mergeCells(`G${row}:I${row}`);
      sheet.getCell(`G${row}`).value = label;
      sheet.getCell(`G${row}`).font = {
        bold: isTotal,
      };

      sheet.mergeCells(`J${row}:L${row}`);
      sheet.getCell(`J${row}`).value = value;
      sheet.getCell(`J${row}`).numFmt = wholeNumber ? "0" : "0.00";
      sheet.getCell(`J${row}`).font = {
        bold: isTotal,
      };

      for (const address of [`G${row}`, `J${row}`]) {
        sheet.getCell(address).fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: {
            argb: isTotal ? "FFB4C7E7" : "FFF2F2F2",
          },
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
      "Business Top-Up",
      "Overnight",
      "Site / Job",
      "Total Paid Hrs",
    ];

    const headerRowNumber = 11;
    const headerRow = sheet.getRow(headerRowNumber);

    headerRow.height = 38;

    headers.forEach((header, index) => {
      const cell = headerRow.getCell(index + 1);

      cell.value = header;
      cell.font = {
        bold: true,
      };
      cell.alignment = {
        horizontal: "center",
        vertical: "middle",
        wrapText: true,
      };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: {
          argb: "FFD9D9D9",
        },
      };

      applyBorder(cell);
    });

    let rowNumber = headerRowNumber + 1;

    let cursor = new Date(fromDate);
    cursor.setHours(0, 0, 0, 0);

    const endCursor = new Date(toDate);
    endCursor.setHours(0, 0, 0, 0);

    while (cursor <= endCursor) {
      const key = dateKey(cursor);
      const entries = entriesByDate.get(key) || [];
      const computedDay = computedDayByDate.get(key);
      const businessTopUp = Number(
        businessTopUpByDate.get(key) || 0,
      );

      const jobs = [
        ...new Set(
          entries
            .map((entry) => {
              const job = entry.job?.trim() || "";
              const description = entry.description?.trim() || "";

              if (job && description) {
                return `${job} - ${description}`;
              }

              return (
                job ||
                description ||
                typeLabel(String(entry.type))
              );
            })
            .filter(Boolean),
        ),
      ].join("\n");

      const starts = entries
        .map((entry) => formatTime(entry.startTime))
        .filter(Boolean);

      const finishes = entries
        .map((entry) => formatTime(entry.finishTime))
        .filter(Boolean);

      const dailyPaid =
        Number(computedDay?.paidHours || 0) + businessTopUp;

      const row = sheet.getRow(rowNumber);

      row.values = [
        new Date(cursor),
        formatDay(cursor),
        starts[0] || "",
        finishes.at(-1) || "",
        Number(computedDay?.regularHours || 0) || "",
        Number(computedDay?.otMonFriHours || 0) || "",
        Number(computedDay?.otSatHours || 0) || "",
        Number(computedDay?.otSunBhHours || 0) || "",
        businessTopUp || "",
        Number(computedDay?.overnightCount || 0) || "",
        jobs,
        dailyPaid || "",
      ];

      row.getCell(1).numFmt = "dd/mm/yyyy";
      row.height = Math.max(
        22,
        18 * Math.max(1, entries.length),
      );

      for (let column = 1; column <= 12; column += 1) {
        const cell = row.getCell(column);

        cell.alignment = {
          vertical: "middle",
          horizontal:
            column === 2 || column === 11 ? "left" : "center",
          wrapText: column === 11,
        };

        applyBorder(cell);
      }

      for (const column of [5, 6, 7, 8, 9, 12]) {
        row.getCell(column).numFmt = "0.00";
      }

      row.getCell(10).numFmt = "0";

      if (cursor.getDay() === 0 || cursor.getDay() === 6) {
        for (let column = 1; column <= 12; column += 1) {
          row.getCell(column).fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: {
              argb: "FFF2F2F2",
            },
          };
        }
      }

      rowNumber += 1;
      cursor = addDays(cursor, 1);
    }

    const totalsRow = sheet.getRow(rowNumber);

    totalsRow.getCell(1).value = "Period Totals";
    totalsRow.getCell(5).value = periodRegular;
    totalsRow.getCell(6).value = periodOtMonFri;
    totalsRow.getCell(7).value = periodOtSat;
    totalsRow.getCell(8).value = periodOtSunBh;
    totalsRow.getCell(9).value = periodBusinessTopUp;
    totalsRow.getCell(10).value = periodOvernights;
    totalsRow.getCell(12).value = periodPaid;

    for (let column = 1; column <= 12; column += 1) {
      const cell = totalsRow.getCell(column);

      cell.font = {
        bold: true,
      };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: {
          argb: "FFB4C7E7",
        },
      };
      cell.alignment = {
        horizontal: column === 1 ? "left" : "center",
        vertical: "middle",
      };

      applyBorder(cell);
    }

    for (const column of [5, 6, 7, 8, 9, 12]) {
      totalsRow.getCell(column).numFmt = "0.00";
    }

    totalsRow.getCell(10).numFmt = "0";

    const approvalHeading = rowNumber + 2;

    sheet.mergeCells(
      `A${approvalHeading}:F${approvalHeading}`,
    );
    sheet.getCell(`A${approvalHeading}`).value =
      "Approved Weeks Included";
    sheet.getCell(`A${approvalHeading}`).font = {
      bold: true,
      size: 12,
    };
    sheet.getCell(`A${approvalHeading}`).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: {
        argb: "FFD9E2F3",
      },
    };

    let approvalRow = approvalHeading + 1;

    if (approvalRows.length === 0) {
      sheet.mergeCells(`A${approvalRow}:F${approvalRow}`);
      sheet.getCell(`A${approvalRow}`).value =
        "No approved weeks were found for the selected period.";
      approvalRow += 1;
    } else {
      for (const approval of approvalRows) {
        sheet.getCell(`A${approvalRow}`).value =
          "Week commencing";
        sheet.getCell(`B${approvalRow}`).value =
          approval.weekStart;
        sheet.getCell(`B${approvalRow}`).numFmt =
          "dd/mm/yyyy";

        sheet.getCell(`C${approvalRow}`).value =
          "Approved by";
        sheet.getCell(`D${approvalRow}`).value =
          approval.approvedBy;

        sheet.getCell(`E${approvalRow}`).value =
          approval.approvedAt
            ? formatLongDate(approval.approvedAt)
            : "Approval date unavailable";

        sheet.getCell(`F${approvalRow}`).value =
          `Paid ${approval.paidHours.toFixed(2)}h; top-up ${approval.businessTopUp.toFixed(2)}h`;

        approvalRow += 1;
      }
    }

    sheet.views = [
      {
        state: "frozen",
        ySplit: headerRowNumber,
      },
    ];

    sheet.autoFilter = {
      from: `A${headerRowNumber}`,
      to: `L${rowNumber - 1}`,
    };

    sheet.pageSetup.printArea = `A1:L${approvalRow}`;
    sheet.headerFooter.oddFooter =
      "&LPastorfrigor GB Ltd&CPayroll Report&RPage &P of &N";

    const buffer = await workbook.xlsx.writeBuffer();

    const fileName =
      `payroll-${safeFileName(employeeName)}-${from}-to-${to}.xlsx`;

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition":
          `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Payroll export failed:", error);

    return NextResponse.json(
      {
        error: "Failed to export payroll",
      },
      {
        status: 500,
      },
    );
  }
}