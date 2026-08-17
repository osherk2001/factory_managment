import "server-only";

import { prisma } from "@/lib/db/client";
import {
  requireTenantContext,
  type TenantContext,
} from "@/modules/authorization";

import {
  WorkerContextError,
  WORKER_CONTEXT_ERROR_CODES,
} from "./worker-context.errors";
import type { EmployeeContext } from "./worker-context.types";

export async function resolveEmployeeContext(
  tenant: TenantContext,
): Promise<EmployeeContext> {
  const employee = await prisma.employeeProfile.findUnique({
    where: {
      organizationId_membershipId: {
        organizationId: tenant.organizationId,
        membershipId: tenant.membershipId,
      },
    },
    select: {
      id: true,
      displayName: true,
      isActive: true,
    },
  });

  if (!employee) {
    throw new WorkerContextError(
      WORKER_CONTEXT_ERROR_CODES.EMPLOYEE_PROFILE_REQUIRED,
    );
  }

  if (!employee.isActive) {
    throw new WorkerContextError(WORKER_CONTEXT_ERROR_CODES.EMPLOYEE_INACTIVE);
  }

  return {
    userId: tenant.userId,
    membershipId: tenant.membershipId,
    organizationId: tenant.organizationId,
    organizationName: tenant.organizationName,
    employeeId: employee.id,
    displayName: employee.displayName,
  };
}

export async function requireEmployeeContext(): Promise<EmployeeContext> {
  const tenant = await requireTenantContext();
  return resolveEmployeeContext(tenant);
}
