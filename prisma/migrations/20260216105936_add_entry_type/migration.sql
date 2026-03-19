-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_TimesheetEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "weekId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'WORK',
    "description" TEXT,
    "hours" REAL NOT NULL,
    "startTime" TEXT NOT NULL DEFAULT '08:00',
    "finishTime" TEXT NOT NULL DEFAULT '17:00',
    "regularHours" REAL NOT NULL DEFAULT 0,
    "otMonFriHours" REAL NOT NULL DEFAULT 0,
    "otSatHours" REAL NOT NULL DEFAULT 0,
    "otSunBhHours" REAL NOT NULL DEFAULT 0,
    "overnight" BOOLEAN NOT NULL DEFAULT false,
    "agreedRate" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TimesheetEntry_weekId_fkey" FOREIGN KEY ("weekId") REFERENCES "TimesheetWeek" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TimesheetEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TimesheetEntry_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_TimesheetEntry" ("agreedRate", "createdAt", "date", "description", "finishTime", "hours", "id", "otMonFriHours", "otSatHours", "otSunBhHours", "overnight", "projectId", "regularHours", "startTime", "updatedAt", "userId", "weekId") SELECT "agreedRate", "createdAt", "date", "description", "finishTime", "hours", "id", "otMonFriHours", "otSatHours", "otSunBhHours", "overnight", "projectId", "regularHours", "startTime", "updatedAt", "userId", "weekId" FROM "TimesheetEntry";
DROP TABLE "TimesheetEntry";
ALTER TABLE "new_TimesheetEntry" RENAME TO "TimesheetEntry";
CREATE INDEX "TimesheetEntry_weekId_idx" ON "TimesheetEntry"("weekId");
CREATE INDEX "TimesheetEntry_userId_idx" ON "TimesheetEntry"("userId");
CREATE INDEX "TimesheetEntry_projectId_idx" ON "TimesheetEntry"("projectId");
CREATE INDEX "TimesheetEntry_date_idx" ON "TimesheetEntry"("date");
CREATE INDEX "TimesheetEntry_type_idx" ON "TimesheetEntry"("type");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
