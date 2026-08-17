import "server-only";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/client";
import {
  AUTH_ERROR_CODES,
  FactoryFlowAuthError,
} from "@/modules/auth/auth-errors";
import {
  MEMBERSHIP_STATUS_ACTIVE,
  requireTenantContext,
  type TenantContext,
} from "@/modules/authorization";

import {
  WorkerContextError,
  WORKER_CONTEXT_ERROR_CODES,
} from "./worker-context.errors";
import type { EmployeeContext } from "./worker-context.types";

type EmployeeContextDatabase = typeof prisma | Prisma.TransactionClient;

export async function resolveEmployeeContext(
  tenant: TenantContext,
): Promise<EmployeeContext> {
  return resolveEmployeeContextForDatabase(prisma, tenant);
}

export async function resolveEmployeeContextForDatabase(
  database: EmployeeContextDatabase,
  tenant: TenantContext,
): Promise<EmployeeContext> {
  const user = await database.user.findUnique({
    where: { id: tenant.userId },
    select: { id: true, isActive: true },
  });

  if (!user) {
    throw new FactoryFlowAuthError(AUTH_ERROR_CODES.UNAUTHENTICATED);
  }

  if (!user.isActive) {
    throw new FactoryFlowAuthError(AUTH_ERROR_CODES.USER_INACTIVE);
  }

  const membership = await database.membership.findFirst({
    where: {
      id: tenant.membershipId,
      organizationId: tenant.organizationId,
      userId: tenant.userId,
      status: MEMBERSHIP_STATUS_ACTIVE,
    },
    select: { id: true },
  });

  if (!membership) {
    throw new FactoryFlowAuthError(AUTH_ERROR_CODES.MEMBERSHIP_INACTIVE);
  }

  const employee = await database.employeeProfile.findUnique({
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
