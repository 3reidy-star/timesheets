export const runtime = "nodejs";

import { auth } from "@/auth";
import { prisma } from "@/app/lib/prisma";
import ExcelJS from "exceljs";
import { NextResponse } from "next/server";

const DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

type PayrollEntry = {
  id: string;
  date: Date;
  job: string | null;
  type: string;
  startTime: string | Date | null;
  finishTime: string | Date | null;
  hours: unknown;
  regularHours: unknown;
  otMonFriHours: unknown;
  otSatHours: unknown;
  otSunBhHours: unknown;
  overnight: boolean;
  description: string | null;
  week: {
    id: string;
    weekStart: Date;
    user: {
      id: string;
      name: string | null;
      email: string;
    };
  };
};

function startOfDay(value: string) {
  return new Date(`${value}T00:00:00`);
}

function endOfDay(value: string) {
  return new Date(`${value}T23:59:59.999`);
}

function formatDate(date: Date) {
  return date.toLocaleDateString("en-GB");
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

  const trimmed = value.trim();

  if (/^\d{2}:\d{2}/.test(trimmed)) {
    return trimmed.slice(0, 5);
  }

  return trimmed;
}

function safeFileName(value: string) {
  return value
    .replace(/[^a-z0-9-_]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function safeWorksheetName(value: string, existingNames: Set<string>) {
  const base =
    value
      .replace(/[\\/*?:[\]]/g, "")
      .trim()
      .slice(0, 31) || "Timesheet";

  let candidate = base;
  let counter = 2;

  while (existingNames.has(candidate.toLowerCase())) {
    const suffix = ` ${counter}`;
    candidate = `${base.slice(0, 31 - suffix.length)}${suffix}`;
    counter += 1;
  }

  existingNames.add(candidate.toLowerCase());
  return candidate;
}

function numberValue(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getMonday(date: Date) {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);

  const day = result.getDay();
  const difference = day === 0 ? -6 : 1 - day;

  result.setDate(result.getDate() + difference);
  return result;
}

function dateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function displayEntryType(type: string) {
  switch (type) {
    case "HOLIDAY_FULL":
      return "Holiday";
    case "HOLIDAY_HALF":
      return "Half-day holiday";
    case "SICK":
      return "Sick";
    case "TRAINING":
      return "Training";
    case "WORK":
      return "";
    default:
      return type.replaceAll("_", " ");
  }
}

function combineJobs(entries: PayrollEntry[]) {
  const labels = entries
    .map((entry) => {
      const job = entry.job?.trim() || "";
      const type = displayEntryType(entry.type);
      const description = entry.description?.trim() || "";

      if (job && description) {
        return `${job} - ${description}`;
      }

      return job || description || type;
    })
    .filter(Boolean);

  return [...new Set(labels)].join("\n");
}

function firstTime(entries: PayrollEntry[]) {
  return entries
    .map((entry) => formatTime(entry.startTime))
    .find((value) => Boolean(value)) || "";
}

function lastTime(entries: PayrollEntry[]) {
  const values = entries
    .map((entry) => formatTime(entry.finishTime))
    .filter(Boolean);

  return values.at(-1) || "";
}

function groupEntries(entries: PayrollEntry[]) {
  const grouped = new Map<
    string,
    {
      userId: string;
      userName: string;
      userEmail: string;
      weekStart: Date;
      entries: PayrollEntry[];
    }
  >();

  for (const entry of entries) {
    const employeeName =
      entry.week.user.name || entry.week.user.email || "Unknown Employee";

    const monday = entry.week.weekStart
      ? getMonday(entry.week.weekStart)
      : getMonday(entry.date);

    const key = `${entry.week.user.id}:${dateKey(monday)}`;

    const existing = grouped.get(key);

    if (existing) {
      existing.entries.push(entry);
      continue;
    }

    grouped.set(key, {
      userId: entry.week.user.id,
      userName: employeeName,
      userEmail: entry.week.user.email,
      weekStart: monday,
      entries: [entry],
    });
  }

  return [...grouped.values()].sort((a, b) => {
    const employeeComparison = a.userName.localeCompare(b.userName);

    if (employeeComparison !== 0) {
      return employeeComparison;
    }

    return a.weekStart.getTime() - b.weekStart.getTime();
  });
}

function applyThinBorder(cell: ExcelJS.Cell) {
  cell.border = {
    top: { style: "thin", color: { argb: "FF808080" } },
    left: { style: "thin", color: { argb: "FF808080" } },
    bottom: { style: "thin", color: { argb: "FF808080" } },
    right: { style: "thin", color: { argb: "FF808080" } },
  };
}

function styleRange(
  worksheet: ExcelJS.Worksheet,
  range: string,
  style: Partial<ExcelJS.Style>
) {
  const cells = worksheet.getCell(range);

  cells.style = {
    ...cells.style,
    ...style,
  };
}

function buildWeeklyWorksheet({
  workbook,
  sheetName,
  employeeName,
  weekStart,
  entries,
}: {
  workbook: ExcelJS.Workbook;
  sheetName: string;
  employeeName: string;
  weekStart: Date;
  entries: PayrollEntry[];
}) {
  const worksheet = workbook.addWorksheet(sheetName, {
    pageSetup: {
      orientation: "landscape",
      paperSize: 9,
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 1,
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

  worksheet.properties.defaultRowHeight = 20;
  worksheet.views = [{ state: "frozen", ySplit: 5 }];

  worksheet.columns = [
    { key: "day", width: 20 },
    { key: "start", width: 13 },
    { key: "finish", width: 13 },
    { key: "regular", width: 14 },
    { key: "otMonFri", width: 15 },
    { key: "otSat", width: 14 },
    { key: "otSunBh", width: 15 },
    { key: "overnight", width: 14 },
    { key: "site", width: 47 },
    { key: "total", width: 13 },
    { key: "rate", width: 12 },
  ];

  worksheet.mergeCells("A1:K1");
  worksheet.getCell("A1").value = "Pastorfrigor GB Ltd";
  worksheet.getCell("A1").font = {
    bold: true,
    size: 22,
  };
  worksheet.getCell("A1").alignment = {
    vertical: "middle",
    horizontal: "left",
  };
  worksheet.getRow(1).height = 32;

  worksheet.mergeCells("A2:B2");
  worksheet.getCell("A2").value = "Employee Name:";
  worksheet.getCell("A2").font = {
    bold: true,
    size: 12,
  };

  worksheet.mergeCells("C2:E2");
  worksheet.getCell("C2").value = employeeName;
  worksheet.getCell("C2").font = {
    bold: true,
    size: 12,
  };

  worksheet.mergeCells("A3:B3");
  worksheet.getCell("A3").value = "Week Commencing";
  worksheet.getCell("A3").font = {
    bold: true,
    size: 12,
  };

  worksheet.mergeCells("C3:E3");
  worksheet.getCell("C3").value = weekStart;
  worksheet.getCell("C3").numFmt = "dd/mm/yyyy";
  worksheet.getCell("C3").font = {
    bold: true,
    size: 12,
  };

  for (const address of ["A2", "C2", "A3", "C3"]) {
    worksheet.getCell(address).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFFFFF00" },
    };
  }

  worksheet.mergeCells("C4:E4");
  worksheet.getCell("C4").value = "Do not include lunch";
  worksheet.getCell("C4").font = {
    bold: true,
    italic: true,
    size: 11,
  };
  worksheet.getCell("C4").alignment = {
    horizontal: "center",
  };

  const headers = [
    "Enter worked hours",
    "Hours\nStart Time",
    "Hours\nFinish Time",
    "Hours\n(Regular)",
    "Hours (O/T)\nMon - Fri",
    "Hours (O/T)\nSaturday",
    "Hours (O/T)\nSunday/BH",
    "Overnight\nstay (£35)",
    "SITE - Please complete",
    "Total Job\nHrs",
    "Agreed\nRate",
  ];

  const headerRow = worksheet.getRow(5);
  headerRow.height = 48;

  headers.forEach((header, index) => {
    const cell = headerRow.getCell(index + 1);
    cell.value = header;
    cell.font = {
      bold: index !== 0,
      italic: index === 0,
      size: 10,
    };
    cell.alignment = {
      horizontal: index === 0 ? "left" : "center",
      vertical: "middle",
      wrapText: true,
    };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFD9D9D9" },
    };
    applyThinBorder(cell);
  });

  const entriesByDate = new Map<string, PayrollEntry[]>();

  for (const entry of entries) {
    const key = dateKey(entry.date);
    const dayEntries = entriesByDate.get(key) || [];
    dayEntries.push(entry);
    entriesByDate.set(key, dayEntries);
  }

  for (let dayIndex = 0; dayIndex < DAYS.length; dayIndex += 1) {
    const rowNumber = 6 + dayIndex;
    const row = worksheet.getRow(rowNumber);
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + dayIndex);

    const dayEntries = (entriesByDate.get(dateKey(date)) || []).sort((a, b) => {
      return formatTime(a.startTime).localeCompare(formatTime(b.startTime));
    });

    const regular = dayEntries.reduce(
      (sum, entry) => sum + numberValue(entry.regularHours),
      0
    );

    const otMonFri = dayEntries.reduce(
      (sum, entry) => sum + numberValue(entry.otMonFriHours),
      0
    );

    const otSat = dayEntries.reduce(
      (sum, entry) => sum + numberValue(entry.otSatHours),
      0
    );

    const otSunBh = dayEntries.reduce(
      (sum, entry) => sum + numberValue(entry.otSunBhHours),
      0
    );

    const total = dayEntries.reduce(
      (sum, entry) => sum + numberValue(entry.hours),
      0
    );

    const overnightCount = dayEntries.filter(
      (entry) => entry.overnight
    ).length;

    row.values = [
      DAYS[dayIndex],
      firstTime(dayEntries),
      lastTime(dayEntries),
      regular || "",
      otMonFri || "",
      otSat || "",
      otSunBh || "",
      overnightCount || "",
      combineJobs(dayEntries),
      total || "",
      "",
    ];

    row.height = Math.max(24, 18 * Math.max(1, dayEntries.length));

    for (let column = 1; column <= 11; column += 1) {
      const cell = row.getCell(column);

      cell.alignment = {
        vertical: "middle",
        horizontal:
          column === 1 || column === 9 ? "left" : "center",
        wrapText: column === 9,
      };

      applyThinBorder(cell);
    }

    for (let column = 4; column <= 10; column += 1) {
      row.getCell(column).numFmt = "0.00";
    }

    if (dayIndex >= 5) {
      for (let column = 1; column <= 11; column += 1) {
        row.getCell(column).fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFD9D9D9" },
        };
      }
    }
  }

  const totalRowNumber = 13;
  const totalRow = worksheet.getRow(totalRowNumber);
  totalRow.height = 24;

  totalRow.getCell(1).value = "Total Hours";
  totalRow.getCell(1).font = { bold: true };

  totalRow.getCell(4).value = { formula: "SUM(D6:D12)" };
  totalRow.getCell(5).value = { formula: "SUM(E6:E12)" };
  totalRow.getCell(6).value = { formula: "SUM(F6:F12)" };
  totalRow.getCell(7).value = { formula: "SUM(G6:G12)" };
  totalRow.getCell(8).value = { formula: "SUM(H6:H12)" };
  totalRow.getCell(10).value = { formula: "SUM(J6:J12)" };
  totalRow.getCell(11).value = 0;

  for (let column = 1; column <= 11; column += 1) {
    const cell = totalRow.getCell(column);

    cell.font = {
      bold: true,
      size: 11,
    };

    cell.alignment = {
      vertical: "middle",
      horizontal: column === 1 ? "left" : "center",
    };

    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFB4C7E7" },
    };

    applyThinBorder(cell);
  }

  for (let column = 4; column <= 10; column += 1) {
    totalRow.getCell(column).numFmt = "0.00";
  }

  worksheet.mergeCells("F15:I15");
  worksheet.getCell("F15").value = "Approved timesheet";
  worksheet.getCell("F15").font = {
    bold: true,
    size: 11,
  };
  worksheet.getCell("F15").alignment = {
    horizontal: "center",
  };

  worksheet.mergeCells("F16:I18");
  worksheet.getCell("F16").value = employeeName;
  worksheet.getCell("F16").font = {
    bold: true,
    size: 11,
  };
  worksheet.getCell("F16").alignment = {
    horizontal: "left",
    vertical: "middle",
  };

  for (const range of ["F15:I15", "F16:I18"]) {
    styleRange(worksheet, range, {
      fill: {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFD9E2F3" },
      },
    });
  }

  worksheet.autoFilter = {
    from: "A5",
    to: "K12",
  };

 worksheet.pageSetup.printArea = "A1:K18";
  worksheet.headerFooter.oddFooter =
    "&LPastorfrigor GB Ltd&CApproved Timesheet&RPage &P of &N";

  return worksheet;
}

export async function GET(req: Request) {
  try {
    const session = await auth();

    if (!session?.user?.email) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
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
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);

    const from = searchParams.get("from") || "";
    const to = searchParams.get("to") || "";
    const userId = searchParams.get("userId") || "all";
    const isAllEmployees = userId === "all";

    if (!from || !to) {
      return NextResponse.json(
        {
          error: "From date and to date are required",
        },
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
      return NextResponse.json(
        { error: "Invalid date range" },
        { status: 400 }
      );
    }

    const employee = !isAllEmployees
      ? await prisma.user.findUnique({
          where: {
            id: userId,
          },
          select: {
            name: true,
            email: true,
          },
        })
      : null;

    if (!isAllEmployees && !employee) {
      return NextResponse.json(
        { error: "Employee not found" },
        { status: 404 }
      );
    }

    const entries = (await prisma.timesheetEntry.findMany({
      where: {
        date: {
          gte: fromDate,
          lte: toDate,
        },
        week: {
          status: "APPROVED",
          ...(isAllEmployees ? {} : { userId }),
        },
      },
      include: {
        week: {
          include: {
            user: true,
          },
        },
      },
      orderBy: [
        {
          week: {
            user: {
              name: "asc",
            },
          },
        },
        {
          date: "asc",
        },
        {
          createdAt: "asc",
        },
      ],
    })) as PayrollEntry[];

    const groupedWeeks = groupEntries(entries);

    const workbook = new ExcelJS.Workbook();

    workbook.creator = "Timesheets App";
    workbook.company = "Pastorfrigor GB Ltd";
    workbook.subject = "Approved payroll timesheets";
    workbook.created = new Date();
    workbook.modified = new Date();
    workbook.calcProperties.fullCalcOnLoad = true;

    const usedSheetNames = new Set<string>();

    if (groupedWeeks.length === 0) {
      const worksheet = workbook.addWorksheet("No Approved Entries");

      worksheet.getCell("A1").value = "Accounts Payroll";
      worksheet.getCell("A1").font = {
        bold: true,
        size: 18,
      };

      worksheet.getCell("A3").value =
        "No approved timesheet entries were found for the selected date range.";

      worksheet.getCell("A5").value = "From";
      worksheet.getCell("B5").value = fromDate;
      worksheet.getCell("B5").numFmt = "dd/mm/yyyy";

      worksheet.getCell("A6").value = "To";
      worksheet.getCell("B6").value = toDate;
      worksheet.getCell("B6").numFmt = "dd/mm/yyyy";

      worksheet.getColumn("A").width = 24;
      worksheet.getColumn("B").width = 18;
    } else {
      for (const group of groupedWeeks) {
        const shortName = group.userName.split(" ")[0] || group.userName;

        const proposedName = `${shortName} ${formatDate(
          group.weekStart
        ).replaceAll("/", "-")}`;

        const sheetName = safeWorksheetName(
          proposedName,
          usedSheetNames
        );

        buildWeeklyWorksheet({
          workbook,
          sheetName,
          employeeName: group.userName,
          weekStart: group.weekStart,
          entries: group.entries,
        });
      }
    }

    const buffer = await workbook.xlsx.writeBuffer();

    const employeeDisplayName = isAllEmployees
      ? "all-employees"
      : employee?.name || employee?.email || "employee";

    const fileName = `payroll-${safeFileName(
      employeeDisplayName
    )}-${from}-to-${to}.xlsx`;

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
      {
        error: "Failed to export payroll",
      },
      { status: 500 }
    );
  }
}