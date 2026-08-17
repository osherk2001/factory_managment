import "server-only";

import { Prisma } from "@prisma/client";

import {
  WorkerContextError,
  WORKER_CONTEXT_ERROR_CODES,
} from "./worker-context.errors";

/**
 * Lock the stable per-worker production-context resource.
 *
 * WorkerProductionContext is optional for single-role workers, so the
 * EmployeeProfile row is the shared mutex for role selection and responsibility
 * mutations.
 */
export async function lockEmployeeForProductionMutation(
  database: Prisma.TransactionClient,
  organizationId: string,
  employeeId: string,
): Promise<void> {
  const rows = await database.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`
      SELECT "id"
      FROM "EmployeeProfile"
      WHERE "organizationId" = CAST(${organizationId} AS uuid)
        AND "id" = CAST(${employeeId} AS uuid)
      FOR UPDATE
    `,
  );

  if (rows.length !== 1) {
    throw new WorkerContextError(
      WORKER_CONTEXT_ERROR_CODES.EMPLOYEE_PROFILE_REQUIRED,
    );
  }
}
