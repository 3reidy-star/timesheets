// A targeted, additive deployment check for the existing DayApproval model.
// Never run db push/reset: unrelated tables and existing payroll stay untouched.
function isMissingDayApproval(error) {
  return error?.code === 'P2021' && (
    error.meta?.modelName === 'DayApproval' ||
    /(?:^|[."])DayApproval"?$/.test(String(error.meta?.table || ''))
  );
}

const statements = [
  // Serialize concurrent deployments on this specific repair.
  'DO $$ BEGIN PERFORM pg_advisory_xact_lock(74228151); END $$;',
  `DO $$ BEGIN
    CREATE TYPE "DayApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
  `CREATE TABLE IF NOT EXISTS "DayApproval" (
    "id" TEXT NOT NULL,
    "weekId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "status" "DayApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "comment" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DayApproval_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "DayApproval_weekId_fkey" FOREIGN KEY ("weekId") REFERENCES "TimesheetWeek"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DayApproval_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
  );`,
  'CREATE UNIQUE INDEX IF NOT EXISTS "DayApproval_weekId_date_key" ON "DayApproval"("weekId", "date");',
  'CREATE INDEX IF NOT EXISTS "DayApproval_weekId_idx" ON "DayApproval"("weekId");',
  'CREATE INDEX IF NOT EXISTS "DayApproval_date_idx" ON "DayApproval"("date");',
  'CREATE INDEX IF NOT EXISTS "DayApproval_status_idx" ON "DayApproval"("status");',
  'CREATE INDEX IF NOT EXISTS "DayApproval_reviewedById_idx" ON "DayApproval"("reviewedById");',
];

async function ensureDayApproval(prisma) {
  try {
    // Select every model column, even when the table is empty.
    await prisma.dayApproval.findFirst();
    return { created: false };
  } catch (error) {
    if (!isMissingDayApproval(error)) throw error;
  }
  console.log('DayApproval is missing. Creating only the day-approval table and its enum/indexes.');
  await prisma.$transaction(async tx => {
    for (const sql of statements) await tx.$executeRawUnsafe(sql);
  }, { timeout: 30000 });
  await prisma.dayApproval.findFirst();
  console.log('DayApproval schema check passed. Existing timesheets were not modified.');
  return { created: true };
}

async function main() {
  if (!process.env.DATABASE_URL) {
    if (process.env.VERCEL) throw new Error('DATABASE_URL is required to verify payroll schema on Vercel.');
    console.log('No local DATABASE_URL; skipping the live payroll schema check.');
    return;
  }
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  try { await ensureDayApproval(prisma); }
  finally { await prisma.$disconnect(); }
}

module.exports = { ensureDayApproval, isMissingDayApproval, statements };
if (require.main === module) main().catch(error => {
  // Do not print connection strings or record contents into build logs.
  console.error('Payroll schema verification failed:', error.code || error.name);
  process.exitCode = 1;
});
