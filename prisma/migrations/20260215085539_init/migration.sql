-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_TimesheetEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "weekId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
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
INSERT INTO "new_TimesheetEntry" ("createdAt", "date", "description", "hours", "id", "projectId", "userId", "weekId") SELECT "createdAt", "date", "description", "hours", "id", "projectId", "userId", "weekId" FROM "TimesheetEntry";
DROP TABLE "TimesheetEntry";
ALTER TABLE "new_TimesheetEntry" RENAME TO "TimesheetEntry";
CREATE INDEX "TimesheetEntry_weekId_idx" ON "TimesheetEntry"("weekId");
CREATE INDEX "TimesheetEntry_userId_idx" ON "TimesheetEntry"("userId");
CREATE INDEX "TimesheetEntry_projectId_idx" ON "TimesheetEntry"("projectId");
CREATE INDEX "TimesheetEntry_date_idx" ON "TimesheetEntry"("date");
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'ENGINEER',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_User" ("createdAt", "email", "id", "name", "role") SELECT "createdAt", "email", "id", "name", "role" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "TimesheetWeek_userId_idx" ON "TimesheetWeek"("userId");

-- CreateIndex
CREATE INDEX "TimesheetWeek_weekStart_idx" ON "TimesheetWeek"("weekStart");
