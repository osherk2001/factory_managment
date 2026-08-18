import "server-only";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/client";

import { WORKFLOW_ERROR_CODES, WorkflowError } from "./workflow-errors";
import { buildWorkflowTransitionMetadata } from "./workflow-movement";
import type {
  ProductWorkflowDto,
  WorkflowStageDto,
  WorkflowStageResolution,
} from "./workflow-types";

type WorkflowDatabase = typeof prisma | Prisma.TransactionClient;

const workflowSnapshotSelect =
  Prisma.validator<Prisma.WorkflowSnapshotSelect>()({
    id: true,
    sourceTemplateId: true,
    sourceVersion: true,
    sourceTemplate: { select: { name: true } },
    stages: {
      orderBy: [{ position: "asc" }, { code: "asc" }],
      select: {
        id: true,
        code: true,
        name: true,
        position: true,
        productionRole: { select: { id: true, code: true, name: true } },
      },
    },
  });

type WorkflowSnapshotRecord = Prisma.WorkflowSnapshotGetPayload<{
  select: typeof workflowSnapshotSelect;
}>;

function toStageDto(
  stage: WorkflowSnapshotRecord["stages"][number],
): WorkflowStageDto {
  if (stage.position === null || stage.position <= 0) {
    throw new WorkflowError(WORKFLOW_ERROR_CODES.WORKFLOW_INVALID);
  }

  return {
    id: stage.id,
    code: stage.code,
    name: stage.name,
    position: stage.position,
    productionRole: stage.productionRole,
  };
}

function mapSnapshot(
  snapshot: WorkflowSnapshotRecord,
  currentStageId: string | null,
): ProductWorkflowDto {
  const stages = snapshot.stages.map(toStageDto);
  const currentStage =
    stages.find((stage) => stage.id === currentStageId) ?? null;
  const expectedNextStage = currentStage
    ? (stages.find((stage) => stage.position > currentStage.position) ?? null)
    : (stages[0] ?? null);

  return {
    snapshotId: snapshot.id,
    templateId: snapshot.sourceTemplateId,
    templateName: snapshot.sourceTemplate?.name ?? null,
    sourceVersion: snapshot.sourceVersion,
    currentStage,
    expectedNextStage,
    stages,
  };
}

export async function getProductWorkflow(
  database: WorkflowDatabase,
  organizationId: string,
  productId: string,
  currentStageId: string | null,
): Promise<ProductWorkflowDto | null> {
  const snapshot = await database.workflowSnapshot.findFirst({
    where: { organizationId, productId },
    select: workflowSnapshotSelect,
  });

  return snapshot ? mapSnapshot(snapshot, currentStageId) : null;
}

export async function resolveWorkflowStageForRole(input: {
  database: WorkflowDatabase;
  organizationId: string;
  productId: string;
  currentStageId: string | null;
  productionRoleId: string;
  selectedWorkflowStageId?: string | null;
}): Promise<WorkflowStageResolution> {
  const workflow = await getProductWorkflow(
    input.database,
    input.organizationId,
    input.productId,
    input.currentStageId,
  );

  if (!workflow) {
    if (input.selectedWorkflowStageId) {
      throw new WorkflowError(
        WORKFLOW_ERROR_CODES.WORKFLOW_STAGE_NOT_AVAILABLE,
      );
    }
    return {
      kind: "NO_WORKFLOW",
      snapshotId: null,
      currentStage: null,
      expectedNextStage: null,
      stage: null,
      movement: null,
      metadata: null,
    };
  }

  const candidates = workflow.stages.filter(
    (stage) => stage.productionRole?.id === input.productionRoleId,
  );

  if (candidates.length === 0) {
    if (input.selectedWorkflowStageId) {
      throw new WorkflowError(
        WORKFLOW_ERROR_CODES.WORKFLOW_STAGE_NOT_AVAILABLE,
      );
    }
    return {
      kind: "UNMAPPED_ROLE",
      snapshotId: workflow.snapshotId,
      currentStage: workflow.currentStage,
      expectedNextStage: workflow.expectedNextStage,
      stage: null,
      movement: "UNMAPPED",
      metadata: buildWorkflowTransitionMetadata({
        snapshotId: workflow.snapshotId,
        currentStage: workflow.currentStage,
        expectedStage: workflow.expectedNextStage,
        actualStage: null,
        actualProductionRoleId: input.productionRoleId,
      }),
    };
  }

  const selectedStage = input.selectedWorkflowStageId
    ? candidates.find((stage) => stage.id === input.selectedWorkflowStageId)
    : candidates.length === 1
      ? candidates[0]
      : null;

  if (input.selectedWorkflowStageId && !selectedStage) {
    throw new WorkflowError(WORKFLOW_ERROR_CODES.WORKFLOW_STAGE_NOT_AVAILABLE);
  }

  if (!selectedStage) {
    return {
      kind: "SELECTION_REQUIRED",
      selection: {
        snapshotId: workflow.snapshotId,
        productId: input.productId,
        currentStage: workflow.currentStage,
        expectedNextStage: workflow.expectedNextStage,
        candidates,
      },
    };
  }

  const metadata = buildWorkflowTransitionMetadata({
    snapshotId: workflow.snapshotId,
    currentStage: workflow.currentStage,
    expectedStage: workflow.expectedNextStage,
    actualStage: selectedStage,
    actualProductionRoleId: input.productionRoleId,
  });

  return {
    kind: "RESOLVED",
    snapshotId: workflow.snapshotId,
    currentStage: workflow.currentStage,
    expectedNextStage: workflow.expectedNextStage,
    stage: selectedStage,
    movement: metadata.movement,
    metadata,
  };
}
