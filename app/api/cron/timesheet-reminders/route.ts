export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";

const GRAPH_SCOPE = "https://graph.microsoft.com/.default";
const SENDER_EMAIL = "operations@pfgbltd.com";
const RECIPIENT_EMAIL = "operations@pfgbltd.com";

type OutstandingTimesheet = {
  name: string;
  email: string;
  status: "NO_TIMESHEET" | "DRAFT" | "REJECTED";
};

function requireEnvironmentVariable(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/London",
  }).format(date);
}

function getPreviousWeekStart(): Date {
  const now = new Date();

  const londonDateParts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);

  const year = Number(
    londonDateParts.find((part) => part.type === "year")?.value
  );

  const month = Number(
    londonDateParts.find((part) => part.type === "month")?.value
  );

  const day = Number(
    londonDateParts.find((part) => part.type === "day")?.value
  );

  const londonTodayAtUtcMidnight = new Date(
    Date.UTC(year, month - 1, day)
  );

  const dayOfWeek = londonTodayAtUtcMidnight.getUTCDay();
  const daysSinceMonday = (dayOfWeek + 6) % 7;

  const currentWeekMonday = new Date(londonTodayAtUtcMidnight);

  currentWeekMonday.setUTCDate(
    currentWeekMonday.getUTCDate() - daysSinceMonday
  );

  const previousWeekMonday = new Date(currentWeekMonday);

  previousWeekMonday.setUTCDate(
    previousWeekMonday.getUTCDate() - 7
  );

  return previousWeekMonday;
}

async function getMicrosoftGraphAccessToken(): Promise<string> {
  const tenantId = requireEnvironmentVariable("MICROSOFT_TENANT_ID");
  const clientId = requireEnvironmentVariable("MICROSOFT_CLIENT_ID");
  const clientSecret = requireEnvironmentVariable(
    "MICROSOFT_CLIENT_SECRET"
  );

  const tokenUrl =
    `https://login.microsoftonline.com/` +
    `${encodeURIComponent(tenantId)}/oauth2/v2.0/token`;

  const tokenResponse = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      scope: GRAPH_SCOPE,
      grant_type: "client_credentials",
    }),
    cache: "no-store",
  });

  if (!tokenResponse.ok) {
    const responseText = await tokenResponse.text();

    throw new Error(
      `Microsoft token request failed with status ` +
        `${tokenResponse.status}: ${responseText}`
    );
  }

  const tokenData = (await tokenResponse.json()) as {
    access_token?: string;
  };

  if (!tokenData.access_token) {
    throw new Error(
      "Microsoft token response did not include an access token."
    );
  }

  return tokenData.access_token;
}

function getStatusLabel(
  status: OutstandingTimesheet["status"]
): string {
  switch (status) {
    case "DRAFT":
      return "Draft";

    case "REJECTED":
      return "Rejected – resubmission required";

    case "NO_TIMESHEET":
      return "No timesheet created";
  }
}

function buildEmailHtml(
  weekStart: Date,
  outstanding: OutstandingTimesheet[]
): string {
  const rows = outstanding
    .map((person) => {
      return `
        <tr>
          <td style="
            padding: 10px 12px;
            border-bottom: 1px solid #e5e7eb;
          ">
            ${escapeHtml(person.name)}
          </td>

          <td style="
            padding: 10px 12px;
            border-bottom: 1px solid #e5e7eb;
          ">
            ${escapeHtml(getStatusLabel(person.status))}
          </td>
        </tr>
      `;
    })
    .join("");

  return `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <title>Outstanding timesheets</title>
      </head>

      <body style="
        margin: 0;
        padding: 24px;
        background-color: #f3f4f6;
        font-family: Arial, Helvetica, sans-serif;
        color: #111827;
      ">
        <div style="
          max-width: 650px;
          margin: 0 auto;
          background-color: #ffffff;
          border-radius: 8px;
          padding: 28px;
        ">
          <h1 style="
            margin: 0 0 8px;
            font-size: 24px;
          ">
            Outstanding timesheets
          </h1>

          <p style="
            margin: 0 0 24px;
            color: #4b5563;
          ">
            Week commencing ${escapeHtml(formatDate(weekStart))}
          </p>

          <p>
            The following employees have not submitted their
            timesheets:
          </p>

          <table style="
            width: 100%;
            border-collapse: collapse;
            margin-top: 20px;
          ">
            <thead>
              <tr style="background-color: #f9fafb;">
                <th style="
                  text-align: left;
                  padding: 10px 12px;
                  border-bottom: 2px solid #d1d5db;
                ">
                  Employee
                </th>

                <th style="
                  text-align: left;
                  padding: 10px 12px;
                  border-bottom: 2px solid #d1d5db;
                ">
                  Status
                </th>
              </tr>
            </thead>

            <tbody>
              ${rows}
            </tbody>
          </table>

          <p style="
            margin-top: 24px;
            color: #4b5563;
            font-size: 14px;
          ">
            Employees with submitted or approved timesheets have
            been excluded from this email.
          </p>
        </div>
      </body>
    </html>
  `;
}

async function sendSummaryEmail(
  accessToken: string,
  weekStart: Date,
  outstanding: OutstandingTimesheet[]
): Promise<void> {
  const subject =
    `Outstanding timesheets – week commencing ` +
    `${formatDate(weekStart)}`;

  const graphResponse = await fetch(
    `https://graph.microsoft.com/v1.0/users/` +
      `${encodeURIComponent(SENDER_EMAIL)}/sendMail`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: {
          subject,
          body: {
            contentType: "HTML",
            content: buildEmailHtml(weekStart, outstanding),
          },
          toRecipients: [
            {
              emailAddress: {
                address: RECIPIENT_EMAIL,
              },
            },
          ],
        },
        saveToSentItems: true,
      }),
      cache: "no-store",
    }
  );

  if (!graphResponse.ok) {
    const responseText = await graphResponse.text();

    throw new Error(
      `Microsoft Graph sendMail failed with status ` +
        `${graphResponse.status}: ${responseText}`
    );
  }
}

function isAuthorisedCronRequest(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET?.trim();

  if (!cronSecret) {
    console.error("CRON_SECRET has not been configured.");
    return false;
  }

  const authorizationHeader = request.headers.get("authorization");

  return authorizationHeader === `Bearer ${cronSecret}`;
}

export async function GET(request: NextRequest) {
  try {
    if (!isAuthorisedCronRequest(request)) {
      return NextResponse.json(
        { error: "Unauthorised" },
        { status: 401 }
      );
    }

    const weekStart = getPreviousWeekStart();

    const activeEngineers = await prisma.user.findMany({
      where: {
        active: true,
        role: "ENGINEER",
        email: {
          not: null,
        },
      },
      select: {
        id: true,
        name: true,
        email: true,
      },
      orderBy: {
        name: "asc",
      },
    });

    const engineerIds = activeEngineers.map(
      (engineer) => engineer.id
    );

    const timesheetWeeks =
      engineerIds.length === 0
        ? []
        : await prisma.timesheetWeek.findMany({
            where: {
              weekStart,
              userId: {
                in: engineerIds,
              },
            },
            select: {
              userId: true,
              status: true,
            },
          });

    const weekByUserId = new Map(
      timesheetWeeks.map((week) => [week.userId, week])
    );

    const outstanding: OutstandingTimesheet[] = [];

    for (const engineer of activeEngineers) {
      const engineerEmail = engineer.email?.trim();

      if (!engineerEmail) {
        continue;
      }

      const engineerName =
        engineer.name?.trim() || engineerEmail;

      const week = weekByUserId.get(engineer.id);

      if (!week) {
        outstanding.push({
          name: engineerName,
          email: engineerEmail,
          status: "NO_TIMESHEET",
        });

        continue;
      }

      if (week.status === "DRAFT") {
        outstanding.push({
          name: engineerName,
          email: engineerEmail,
          status: "DRAFT",
        });

        continue;
      }

      if (week.status === "REJECTED") {
        outstanding.push({
          name: engineerName,
          email: engineerEmail,
          status: "REJECTED",
        });
      }

      // SUBMITTED and APPROVED are intentionally excluded.
    }

    if (outstanding.length === 0) {
      return NextResponse.json({
        success: true,
        emailSent: false,
        weekStart: weekStart.toISOString(),
        message: "All active engineers have submitted.",
      });
    }

    const accessToken = await getMicrosoftGraphAccessToken();

    await sendSummaryEmail(
      accessToken,
      weekStart,
      outstanding
    );

    return NextResponse.json({
      success: true,
      emailSent: true,
      weekStart: weekStart.toISOString(),
      outstandingCount: outstanding.length,
      outstanding: outstanding.map((person) => ({
        name: person.name,
        status: person.status,
      })),
    });
  } catch (error) {
    console.error("Timesheet reminder cron failed:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unknown error",
      },
      { status: 500 }
    );
  }
}