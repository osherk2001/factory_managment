import "server-only";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/client";
import {
  hasPermission,
  requirePermission,
  type TenantContext,
} from "@/modules/authorization";
import {
  resolveEmployeeContext,
  resolveEmployeeContextForDatabase,
} from "@/modules/worker-context/employee-context.service";
import { resolveWorkerProductionRoleState } from "@/modules/worker-context/production-role-context.service";
import {
  WorkerContextError,
  WORKER_CONTEXT_ERROR_CODES,
} from "@/modules/worker-context/worker-context.errors";
import type { EmployeeContext } from "@/modules/worker-context/worker-context.types";

import { SCAN_ERROR_CODES, WorkerScanError } from "./scan-errors";
import type {
  ActiveProductionHandlingContextDto,
  ScanEmployeeDto,
  ScanLocationDto,
  ScanProductionRoleDto,
} from "./scan-types";

export type ActiveProductionHandlingContext = {
  tenant: TenantContext;
  employee: EmployeeContext;
  productionRole: ScanProductionRoleDto;
  handlingLocation: ScanLocationDto;
};

type HandlingContextDatabase = typeof prisma | Prisma.TransactionClient;

function toHandlingLocationDto(location: {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  departmentId: string | null;
}): ScanLocationDto {
  return {
    id: location.id,
    code: location.code,
    name: location.name,
    departmentId: location.departmentId,
  };
}

function toProductionRoleDto(role: {
  id: string;
  code: string;
  name: string;
}): ScanProductionRoleDto {
  return { id: role.id, code: role.code, name: role.name };
}

async function resolveRoleAndLocation(
  database: HandlingContextDatabase,
  employee: EmployeeContext,
  productionRoleId: string,
) {
  const link = await database.employeeProductionRole.findFirst({
    where: {
      organizationId: employee.organizationId,
      employeeId: employee.employeeId,
      productionRoleId,
      productionRole: { isActive: true },
    },
    select: {
      productionRole: {
        select: { id: true, code: true, name: true },
      },
      handlingLocation: {
        select: {
          id: true,
          code: true,
          name: true,
          isActive: true,
          departmentId: true,
        },
      },
    },
  });

  if (!link) {
    throw new WorkerContextError(
      WORKER_CONTEXT_ERROR_CODES.PRODUCTION_ROLE_NOT_AVAILABLE,
    );
  }

  if (!link.handlingLocation) {
    throw new WorkerScanError(SCAN_ERROR_CODES.WORK_LOCATION_REQUIRED);
  }

  if (!link.handlingLocation.isActive) {
    throw new WorkerScanError(SCAN_ERROR_CODES.WORK_LOCATION_INACTIVE);
  }

  return {
    productionRole: toProductionRoleDto(link.productionRole),
    handlingLocation: toHandlingLocationDto(link.handlingLocation),
  };
}

export async function resolveActiveProductionHandlingContextForTenant(
  tenant: TenantContext,
): Promise<ActiveProductionHandlingContext> {
  const employee = await resolveEmployeeContext(tenant);
  const roleState = await resolveWorkerProductionRoleState(employee);

  if (roleState.kind === "NO_PRODUCTION_ROLES") {
    throw new WorkerContextError(
      WORKER_CONTEXT_ERROR_CODES.NO_PRODUCTION_ROLES,
    );
  }

  if (!roleState.activeProductionRole) {
    throw new WorkerContextError(
      WORKER_CONTEXT_ERROR_CODES.ACTIVE_PRODUCTION_ROLE_REQUIRED,
    );
  }

  const roleAndLocation = await resolveRoleAndLocation(
    prisma,
    employee,
    roleState.activeProductionRole.id,
  );

  return {
    tenant,
    employee,
    ...roleAndLocation,
  };
}

export async function resolveActiveProductionHandlingContext(): Promise<ActiveProductionHandlingContext> {
  const tenant = await requirePermission("scans.perform");
  return resolveActiveProductionHandlingContextForTenant(tenant);
}

export async function getWorkerScanPageData(): Promise<ActiveProductionHandlingContextDto> {
  const context = await resolveActiveProductionHandlingContext();

  const employee: ScanEmployeeDto = {
    id: context.employee.employeeId,
    displayName: context.employee.displayName,
  };

  return {
    employee,
    productionRole: context.productionRole,
    handlingLocation: context.handlingLocation,
    canReturnToProcess: await hasPermission("products.reopen", context.tenant),
  };
}

/**
 * Resolve the worker context from the transaction's database client.
 *
 * The context resolved before a state-changing transaction is useful for
 * classification and UX, but it is not authoritative for Product mutation.
 * This resolver deliberately repeats the tenant, employee, effective-role,
 * and handling-location checks using the transaction client.
 */
export async function resolveCurrentProductionHandlingContextInTransaction(
  database: Prisma.TransactionClient,
  tenant: TenantContext,
): Promise<ActiveProductionHandlingContext> {
  const employee = await resolveEmployeeContextForDatabase(database, tenant);

  const [roleLinks, persistedContext] = await Promise.all([
    database.employeeProductionRole.findMany({
      where: {
        organizationId: tenant.organizationId,
        employeeId: employee.employeeId,
        productionRole: { isActive: true },
      },
      select: {
        productionRole: {
          select: { id: true, code: true, name: true },
        },
        handlingLocation: {
          select: {
            id: true,
            code: true,
            name: true,
            isActive: true,
            departmentId: true,
          },
        },
      },
      orderBy: { productionRole: { code: "asc" } },
    }),
    database.workerProductionContext.findUnique({
      where: {
        organizationId_employeeId: {
          organizationId: tenant.organizationId,
          employeeId: employee.employeeId,
        },
      },
      select: { activeProductionRoleId: true },
    }),
  ]);

  if (roleLinks.length === 0) {
    throw new WorkerContextError(
      WORKER_CONTEXT_ERROR_CODES.NO_PRODUCTION_ROLES,
    );
  }

  const persistedRoleLink = persistedContext?.activeProductionRoleId
    ? roleLinks.find(
        (link) =>
          link.productionRole.id === persistedContext.activeProductionRoleId,
      )
    : undefined;
  const effectiveRoleLink =
    persistedRoleLink ?? (roleLinks.length === 1 ? roleLinks[0] : undefined);

  if (!effectiveRoleLink) {
    throw new WorkerContextError(
      WORKER_CONTEXT_ERROR_CODES.ACTIVE_PRODUCTION_ROLE_REQUIRED,
    );
  }

  const roleAndLocation = await resolveRoleAndLocation(
    database,
    employee,
    effectiveRoleLink.productionRole.id,
  );

  return {
    tenant,
    employee,
    ...roleAndLocation,
  };
}
