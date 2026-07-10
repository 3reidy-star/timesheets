export const runtime = "nodejs";

import { auth } from "@/auth";
import { prisma } from "@/app/lib/prisma";
import { NextResponse } from "next/server";
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";

const PAGE_WIDTH = 842;
const PAGE_HEIGHT = 595;
const MARGIN = 28;
const HEADER_HEIGHT = 22;
const ROW_HEIGHT = 18;
const FONT_SIZE = 7;
const TITLE_SIZE = 16;

type Column = {
  label: string;
  width: number;
  align?: "left" | "right" | "center";
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

function trimText(text: string, maxWidth: number, font: PDFFont, size: number) {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;

  let result = text;

  while (
    result.length > 0 &&
    font.widthOfTextAtSize(`${result}...`, size) > maxWidth
  ) {
    result = result.slice(0, -1);
  }

  return result ? `${result}...` : "";
}

function drawCellText({
  page,
  text,
  x,
  y,
  width,
  font,
  size,
  align = "left",
  bold = false,
  boldFont,
}: {
  page: PDFPage;
  text: string;
  x: number;
  y: number;
  width: number;
  font: PDFFont;
  size: number;
  align?: "left" | "right" | "center";
  bold?: boolean;
  boldFont: PDFFont;
}) {
  const activeFont = bold ? boldFont : font;
  const safeText = trimText(text, width - 6, activeFont, size);
  const textWidth = activeFont.widthOfTextAtSize(safeText, size);

  let textX = x + 3;

  if (align === "right") {
    textX = x + width - textWidth - 3;
  } else if (align === "center") {
    textX = x + (width - textWidth) / 2;
  }

  page.drawText(safeText, {
    x: textX,
    y: y + 5,
    size,
    font: activeFont,
    color: rgb(0.1, 0.1, 0.1),
  });
}

function drawTableHeader({
  page,
  y,
  columns,
  font,
  boldFont,
}: {
  page: PDFPage;
  y: number;
  columns: Column[];
  font: PDFFont;
  boldFont: PDFFont;
}) {
  let x = MARGIN;

  for (const column of columns) {
    page.drawRectangle({
      x,
      y,
      width: column.width,
      height: HEADER_HEIGHT,
      color: rgb(0.92, 0.94, 0.96),
      borderColor: rgb(0.7, 0.72, 0.75),
      borderWidth: 0.5,
    });

    drawCellText({
      page,
      text: column.label,
      x,
      y,
      width: column.width,
      font,
      boldFont,
      size: FONT_SIZE,
      align: column.align,
      bold: true,
    });

    x += column.width;
  }
}

function drawTableRow({
  page,
  y,
  columns,
  values,
  font,
  boldFont,
}: {
  page: PDFPage;
  y: number;
  columns: Column[];
  values: string[];
  font: PDFFont;
  boldFont: PDFFont;
}) {
  let x = MARGIN;

  for (let index = 0; index < columns.length; index += 1) {
    const column = columns[index];
    const value = values[index] || "";

    page.drawRectangle({
      x,
      y,
      width: column.width,
      height: ROW_HEIGHT,
      borderColor: rgb(0.78, 0.8, 0.82),
      borderWidth: 0.4,
    });

    drawCellText({
      page,
      text: value,
      x,
      y,
      width: column.width,
      font,
      boldFont,
      size: FONT_SIZE,
      align: column.align,
    });

    x += column.width;
  }
}

export async function GET(req: Request) {
  try {
    const session = await auth();

    if (!session?.user?.email) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const requestingUser = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { role: true },
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
      return NextResponse.json(
        { error: "Invalid date range" },
        { status: 400 }
      );
    }

    const employee = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        name: true,
        email: true,
      },
    });

    if (!employee) {
      return NextResponse.json(
        { error: "Employee not found" },
        { status: 404 }
      );
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

    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdf.embedFont(StandardFonts.HelveticaBold);

    const employeeDisplayName =
      employee.name || employee.email || "Employee";

    const columns: Column[] = [
      { label: "Date", width: 52 },
      { label: "Day", width: 52 },
      { label: "Job / Site", width: 100 },
      { label: "Type", width: 72 },
      { label: "Start", width: 38, align: "center" },
      { label: "Finish", width: 38, align: "center" },
      { label: "Regular", width: 43, align: "right" },
      { label: "OT M-F", width: 42, align: "right" },
      { label: "OT Sat", width: 38, align: "right" },
      { label: "OT Sun/BH", width: 48, align: "right" },
      { label: "Night", width: 34, align: "center" },
      { label: "Description", width: 105 },
      { label: "Total", width: 42, align: "right" },
    ];

    let page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    let y = PAGE_HEIGHT - MARGIN;

    const drawPageHeading = () => {
      page.drawText("Accounts Payroll", {
        x: MARGIN,
        y: y - TITLE_SIZE,
        size: TITLE_SIZE,
        font: boldFont,
        color: rgb(0.08, 0.08, 0.08),
      });

      y -= 30;

      page.drawText(`Employee: ${employeeDisplayName}`, {
        x: MARGIN,
        y,
        size: 9,
        font: boldFont,
      });

      page.drawText(
        `Date range: ${formatDate(fromDate)} to ${formatDate(toDate)}`,
        {
          x: 300,
          y,
          size: 9,
          font,
        }
      );

      y -= 16;

      page.drawText("Included: approved entries only", {
        x: MARGIN,
        y,
        size: 8,
        font,
        color: rgb(0.35, 0.35, 0.35),
      });

      y -= 24;
      drawTableHeader({ page, y, columns, font, boldFont });
      y -= ROW_HEIGHT;
    };

    drawPageHeading();

    for (const entry of entries) {
      if (y < MARGIN + 85) {
        page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
        y = PAGE_HEIGHT - MARGIN;
        drawPageHeading();
      }

      drawTableRow({
        page,
        y,
        columns,
        font,
        boldFont,
        values: [
          formatDate(entry.date),
          formatDay(entry.date),
          entry.job || "-",
          entry.type,
          formatTime(entry.startTime),
          formatTime(entry.finishTime),
          Number(entry.regularHours || 0).toFixed(2),
          Number(entry.otMonFriHours || 0).toFixed(2),
          Number(entry.otSatHours || 0).toFixed(2),
          Number(entry.otSunBhHours || 0).toFixed(2),
          entry.overnight ? "Yes" : "",
          entry.description || "-",
          Number(entry.hours || 0).toFixed(2),
        ],
      });

      y -= ROW_HEIGHT;
    }

    if (entries.length === 0) {
      page.drawText("No approved entries found for this date range.", {
        x: MARGIN,
        y: y - 15,
        size: 10,
        font,
      });
      y -= 35;
    }

    if (y < MARGIN + 115) {
      page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - MARGIN;
    }

    y -= 14;

    page.drawText("Payroll Totals", {
      x: MARGIN,
      y,
      size: 12,
      font: boldFont,
    });

    y -= 22;

    const totalItems = [
      ["Regular Hours", totals.regular.toFixed(2)],
      ["OT Mon-Fri", totals.otMonFri.toFixed(2)],
      ["OT Saturday", totals.otSat.toFixed(2)],
      ["OT Sunday / BH", totals.otSunBh.toFixed(2)],
      ["Overnight Allowances", String(totals.overnights)],
      ["Total Hours", totals.total.toFixed(2)],
    ];

    for (const [label, value] of totalItems) {
      page.drawText(label, {
        x: MARGIN,
        y,
        size: 9,
        font: label === "Total Hours" ? boldFont : font,
      });

      page.drawText(value, {
        x: 190,
        y,
        size: 9,
        font: label === "Total Hours" ? boldFont : font,
      });

      y -= 16;
    }

    const pdfBytes = await pdf.save();

const fileName = `payroll-${safeFileName(
  employeeDisplayName
)}-${from}-to-${to}.pdf`;

// Copy the PDF bytes into a definite ArrayBuffer.
// This avoids the ArrayBuffer | SharedArrayBuffer TypeScript error.
const pdfArrayBuffer = new ArrayBuffer(pdfBytes.byteLength);
new Uint8Array(pdfArrayBuffer).set(pdfBytes);

return new NextResponse(pdfArrayBuffer, {
  status: 200,
  headers: {
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename="${fileName}"`,
    "Cache-Control": "no-store",
  },
});
} catch (error) {
  console.error("Payroll PDF export failed:", error);

  return NextResponse.json(
    { error: "Failed to export payroll PDF" },
    { status: 500 }
  );
}
}