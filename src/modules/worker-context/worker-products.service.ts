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
      currentStageId: true,
      workflowSnapshot: {
        select: {
          sourceTemplate: { select: { name: true } },
          stages: {
            orderBy: [{ position: "asc" }, { code: "asc" }],
            select: { id: true, code: true, name: true, position: true },
          },
        },
      },
      transitions: {
        where: {
          eventType: {
            in: [
              "PRODUCT_RECEIVED",
              "RESPONSIBILITY_TAKEN_OVER",
              "PRODUCT_RETURNED_TO_PROCESS",
            ],
          },
        },
        orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
        take: 1,
        select: { metadata: true },
      },
    },
  });

  return products.map((product) => {
    const stages =
      product.workflowSnapshot?.stages.flatMap((stage) =>
        stage.position && stage.position > 0
          ? [{ ...stage, position: stage.position }]
          : [],
      ) ?? [];
    const currentStage =
      stages.find((stage) => stage.id === product.currentStageId) ?? null;
    const expectedNextStage = currentStage
      ? (stages.find((stage) => stage.position > currentStage.position) ?? null)
      : (stages[0] ?? null);
    const transitionMetadata = product.transitions[0]?.metadata;
    const workflowMetadata =
      transitionMetadata &&
      typeof transitionMetadata === "object" &&
      !Array.isArray(transitionMetadata) &&
      transitionMetadata.workflow &&
      typeof transitionMetadata.workflow === "object" &&
      !Array.isArray(transitionMetadata.workflow)
        ? transitionMetadata.workflow
        : null;

    return {
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
      workflow: product.workflowSnapshot
        ? {
            templateName: product.workflowSnapshot.sourceTemplate?.name ?? null,
            currentStage,
            expectedNextStage,
            deviation: workflowMetadata?.deviation === true,
          }
        : null,
    };
  });
}

export async function listWorkerProducts(): Promise<
  readonly WorkerProductDto[]
> {
  const tenant = await requirePermission("products.read");
  const employee = await resolveEmployeeContext(tenant);
  return listWorkerProductsForEmployee(employee);
}
