import "server-only";

import { z } from "zod";

import { prisma } from "@/lib/db/client";
import { requirePermission } from "@/modules/authorization";

import {
  resolveEmployeeContext,
  resolveEmployeeContextForDatabase,
} from "./employee-context.service";
import { lockEmployeeForProductionMutation } from "./production-context-lock";
import {
  WorkerContextError,
  WORKER_CONTEXT_ERROR_CODES,
} from "./worker-context.errors";
import type {
  EmployeeContext,
  ProductionRoleOptionDto,
  WorkerProductionRoleState,
} from "./worker-context.types";

const productionRoleIdSchema = z.string().uuid();

function toProductionRoleOption(role: {
  id: string;
  code: string;
  name: string;
}): ProductionRoleOptionDto {
  return { id: role.id, code: role.code, name: role.name };
}

export async function listAvailableProductionRoles(
  employee: EmployeeContext,
): Promise<readonly ProductionRoleOptionDto[]> {
  const links = await prisma.employeeProductionRole.findMany({
    where: {
      organizationId: employee.organizationId,
      employeeId: employee.employeeId,
      productionRole: { isActive: true },
    },
    select: {
      productionRole: {
        select: { id: true, code: true, name: true },
      },
    },
    orderBy: { productionRole: { code: "asc" } },
  });

  return links.map((link) => toProductionRoleOption(link.productionRole));
}

export async function resolveWorkerProductionRoleState(
  employee: EmployeeContext,
): Promise<WorkerProductionRoleState> {
  const [availableRoles, persistedContext] = await Promise.all([
    listAvailableProductionRoles(employee),
    prisma.workerProductionContext.findUnique({
      where: {
        organizationId_employeeId: {
          organizationId: employee.organizationId,
          employeeId: employee.employeeId,
        },
      },
      select: { activeProductionRoleId: true },
    }),
  ]);

  if (availableRoles.length === 0) {
    return {
      kind: "NO_PRODUCTION_ROLES",
      availableRoles: [],
      activeProductionRole: null,
      activeProductionRoleSource: null,
    };
  }

  const persistedRole = persistedContext?.activeProductionRoleId
    ? availableRoles.find(
        (role) => role.id === persistedContext.activeProductionRoleId,
      )
    : undefined;

  if (persistedRole) {
    return {
      kind: "READY",
      availableRoles,
      activeProductionRole: persistedRole,
      activeProductionRoleSource: "persisted",
    };
  }

  if (availableRoles.length === 1) {
    const [onlyRole] = availableRoles;
    if (!onlyRole) {
      throw new WorkerContextError(
        WORKER_CONTEXT_ERROR_CODES.NO_PRODUCTION_ROLES,
      );
    }

    return {
      kind: "READY",
      availableRoles,
      activeProductionRole: onlyRole,
      activeProductionRoleSource: "automatic",
    };
  }

  return {
    kind: "ACTIVE_PRODUCTION_ROLE_REQUIRED",
    availableRoles,
    activeProductionRole: null,
    activeProductionRoleSource: null,
  };
}

export async function resolveActiveProductionRole(
  employee: EmployeeContext,
): Promise<ProductionRoleOptionDto | null> {
  const state = await resolveWorkerProductionRoleState(employee);
  return state.activeProductionRole;
}

export async function selectActiveProductionRole(
  requestedProductionRoleId: string,
): Promise<WorkerProductionRoleState> {
  const tenant = await requirePermission("scans.perform");
  const employee = await resolveEmployeeContext(tenant);
  const parsedRoleId = productionRoleIdSchema.safeParse(
    requestedProductionRoleId,
  );

  if (!parsedRoleId.success) {
    throw new WorkerContextError(
      WORKER_CONTEXT_ERROR_CODES.PRODUCTION_ROLE_NOT_AVAILABLE,
    );
  }

  const committedEmployee = await prisma.$transaction(async (database) => {
    await lockEmployeeForProductionMutation(
      database,
      employee.organizationId,
      employee.employeeId,
    );

    const currentEmployee = await resolveEmployeeContextForDatabase(
      database,
      tenant,
    );
    const roleLink = await database.employeeProductionRole.findFirst({
      where: {
        organizationId: currentEmployee.organizationId,
        employeeId: currentEmployee.employeeId,
        productionRoleId: parsedRoleId.data,
        productionRole: { isActive: true },
      },
      select: {
        productionRole: {
          select: { id: true },
        },
      },
    });

    if (!roleLink) {
      throw new WorkerContextError(
        WORKER_CONTEXT_ERROR_CODES.PRODUCTION_ROLE_NOT_AVAILABLE,
      );
    }

    await database.workerProductionContext.upsert({
      where: {
        organizationId_employeeId: {
          organizationId: currentEmployee.organizationId,
          employeeId: currentEmployee.employeeId,
        },
      },
      create: {
        organizationId: currentEmployee.organizationId,
        employeeId: currentEmployee.employeeId,
        activeProductionRoleId: roleLink.productionRole.id,
      },
      update: {
        activeProductionRoleId: roleLink.productionRole.id,
      },
    });

    return currentEmployee;
  });

  return resolveWorkerProductionRoleState(committedEmployee);
}
