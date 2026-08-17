import "server-only";

import { ProductStatus } from "@prisma/client";

import { prisma } from "@/lib/db/client";
import { requirePermission } from "@/modules/authorization";

import { resolveEmployeeContext } from "./employee-context.service";
import type { EmployeeContext } from "./worker-context.types";
import type { WorkerProductDto } from "./worker-context.types";

export async function listWorkerProductsForEmployee(
  employee: EmployeeContext,
): Promise<readonly WorkerProductDto[]> {
  const products = await prisma.product.findMany({
    where: {
      organizationId: employee.organizationId,
      currentWorkerId: employee.employeeId,
      status: ProductStatus.IN_PROGRESS,
    },
    orderBy: [
      { isUrgent: "desc" },
      { targetAt: "asc" },
      { createdAt: "asc" },
      { serialNumber: "asc" },
    ],
    select: {
      id: true,
      serialNumber: true,
      status: true,
      version: true,
      isUrgent: true,
      targetAt: true,
      productionOrder: {
        select: { id: true, orderNumber: true },
      },
      productType: {
        select: { id: true, code: true, name: true },
      },
      currentRole: {
        select: { id: true, code: true, name: true },
      },
      currentLocation: {
        select: { id: true, code: true, name: true },
      },
    },
  });

  return products.map((product) => ({
    id: product.id,
    serialNumber: product.serialNumber,
    status: "IN_PROGRESS",
    version: product.version,
    isUrgent: product.isUrgent,
    targetAt: product.targetAt?.toISOString() ?? null,
    productionOrder: product.productionOrder,
    productType: product.productType,
    currentRole: product.currentRole,
    currentLocation: product.currentLocation,
  }));
}

export async function listWorkerProducts(): Promise<
  readonly WorkerProductDto[]
> {
  const tenant = await requirePermission("products.read");
  const employee = await resolveEmployeeContext(tenant);
  return listWorkerProductsForEmployee(employee);
}
