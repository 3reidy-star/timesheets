import { prisma } from "@/app/lib/prisma";
import type { PrismaClient } from "@prisma/client";
import { ensureDayApproval } from "@/scripts/ensure-day-approval.cjs";

// Check the database used by live requests, regardless of the build settings.
// Concurrent requests share one check per server instance. Failed checks retry.
export function createDayApprovalReadiness(client: PrismaClient) {
  let readiness: Promise<{ created: boolean }> | undefined;
  return function ready() {
    if (!readiness) {
      readiness = ensureDayApproval(client).catch((error: unknown) => {
        readiness = undefined;
        throw error;
      });
    }
    return readiness;
  };
}

export const ensureDayApprovalSchema = createDayApprovalReadiness(prisma);
