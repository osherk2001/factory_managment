import "server-only";

import { Prisma } from "@prisma/client";

import { WORKFLOW_ERROR_CODES, WorkflowError } from "./workflow-errors";

function assertValidTemplateStages(
  stages: readonly {
    code: string;
    position: number | null;
    productionRoleId: string | null;
    productionRole: { organizationId: string; isActive: boolean } | null;
  }[],
  organizationId: string,
): void {
  const codes = new Set<string>();
  const positions = new Set<number>();

  for (const stage of stages) {
    if (
      stage.position === null ||
      stage.position <= 0 ||
      codes.has(stage.code) ||
      positions.has(stage.position) ||
      (stage.productionRoleId !== null &&
        (stage.productionRole?.organizationId !== organizationId ||
          !stage.productionRole.isActive))
    ) {
      throw new WorkflowError(WORKFLOW_ERROR_CODES.WORKFLOW_INVALID);
    }
    codes.add(stage.code);
    positions.add(stage.position);
  }
}

export async function createWorkflowSnapshotForProduct(input: {
  database: Prisma.TransactionClient;
  organizationId: string;
  productId: string;
  workflowTemplateId: string;
}): Promise<{
  snapshotId: string;
  templateName: string;
  sourceVersion: number;
}> {
  const template = await input.database.workflowTemplate.findFirst({
    where: {
      id: input.workflowTemplateId,
      organizationId: input.organizationId,
      isActive: true,
    },
    select: {
      id: true,
      name: true,
      version: true,
      stages: {
        orderBy: [{ position: "asc" }, { code: "asc" }],
        select: {
          id: true,
          code: true,
          name: true,
          position: true,
          productionRoleId: true,
          productionRole: {
            select: { organizationId: true, isActive: true },
          },
        },
      },
    },
  });

  if (!template) {
    throw new WorkflowError(WORKFLOW_ERROR_CODES.WORKFLOW_NOT_ACTIVE);
  }
  if (template.stages.length === 0) {
    throw new WorkflowError(WORKFLOW_ERROR_CODES.WORKFLOW_INVALID);
  }
  assertValidTemplateStages(template.stages, input.organizationId);

  const snapshot = await input.database.workflowSnapshot.create({
    data: {
      organizationId: input.organizationId,
      productId: input.productId,
      sourceTemplateId: template.id,
      sourceVersion: template.version,
    },
    select: { id: true },
  });
  await input.database.workflowSnapshotStage.createMany({
    data: template.stages.map((stage) => ({
      organizationId: input.organizationId,
      workflowSnapshotId: snapshot.id,
      productId: input.productId,
      productionRoleId: stage.productionRoleId,
      sourceStageId: stage.id,
      code: stage.code,
      name: stage.name,
      position: stage.position,
    })),
  });

  return {
    snapshotId: snapshot.id,
    templateName: template.name,
    sourceVersion: template.version,
  };
}
