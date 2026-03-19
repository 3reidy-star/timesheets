-- CreateTable
CREATE TABLE "WeekAudit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "weekId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "comment" TEXT,
    "performedById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WeekAudit_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "WeekAudit_weekId_fkey" FOREIGN KEY ("weekId") REFERENCES "TimesheetWeek" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_TimesheetWeek" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "weekStart" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TimesheetWeek_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_TimesheetWeek" ("createdAt", "id", "status", "userId", "weekStart") SELECT "createdAt", "id", "status", "userId", "weekStart" FROM "TimesheetWeek";
DROP TABLE "TimesheetWeek";
ALTER TABLE "new_TimesheetWeek" RENAME TO "TimesheetWeek";
CREATE INDEX "TimesheetWeek_userId_idx" ON "TimesheetWeek"("userId");
CREATE INDEX "TimesheetWeek_weekStart_idx" ON "TimesheetWeek"("weekStart");
CREATE INDEX "TimesheetWeek_status_idx" ON "TimesheetWeek"("status");
CREATE UNIQUE INDEX "TimesheetWeek_userId_weekStart_key" ON "TimesheetWeek"("userId", "weekStart");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "WeekAudit_weekId_idx" ON "WeekAudit"("weekId");

-- CreateIndex
CREATE INDEX "WeekAudit_performedById_idx" ON "WeekAudit"("performedById");

-- CreateIndex
CREATE INDEX "WeekAudit_createdAt_idx" ON "WeekAudit"("createdAt");

-- CreateIndex
CREATE INDEX "WeekAudit_action_idx" ON "WeekAudit"("action");
