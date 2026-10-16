import type { PrismaClient } from "@prisma/client";
export function ensureDayApproval(prisma: PrismaClient): Promise<{ created: boolean }>;
export function isMissingDayApproval(error: unknown): boolean;
export const statements: string[];
