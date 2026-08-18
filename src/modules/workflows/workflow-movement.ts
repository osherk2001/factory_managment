import type { Prisma } from "@prisma/client";

import type {
  WorkflowMovement,
  WorkflowTransitionMetadata,
} from "./workflow-types";

type PositionedStage = { id: string; position: number };

export function classifyWorkflowMovement(
  currentStage: PositionedStage | null,
  actualStage: PositionedStage | null,
): WorkflowMovement {
  if (!actualStage) {
    return "UNMAPPED";
  }
  if (!currentStage) {
    return "INITIAL";
  }
  if (actualStage.id === currentStage.id) {
    return "REPEAT";
  }
  return actualStage.position > currentStage.position ? "FORWARD" : "BACKWARD";
}

export function buildWorkflowTransitionMetadata(input: {
  snapshotId: string;
  currentStage: PositionedStage | null;
  expectedStage: PositionedStage | null;
  actualStage: PositionedStage | null;
  actualProductionRoleId: string;
}): WorkflowTransitionMetadata {
  const movement = classifyWorkflowMovement(
    input.currentStage,
    input.actualStage,
  );

  return {
    schemaVersion: 1,
    snapshotId: input.snapshotId,
    movement,
    expectedStageId: input.expectedStage?.id ?? null,
    actualStageId: input.actualStage?.id ?? null,
    deviation:
      input.actualStage === null ||
      input.actualStage.id !== (input.expectedStage?.id ?? null),
    isRework: movement === "BACKWARD" || movement === "REPEAT",
    ...(movement === "UNMAPPED"
      ? { actualProductionRoleId: input.actualProductionRoleId }
      : {}),
  };
}

function isJsonObject(
  value: Prisma.JsonValue | null | undefined,
): value is Prisma.JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function mergeWorkflowTransitionMetadata(
  existing: Prisma.JsonValue | null | undefined,
  workflow: WorkflowTransitionMetadata | null,
): Prisma.InputJsonValue | undefined {
  if (!workflow) {
    return isJsonObject(existing) ? existing : undefined;
  }

  return {
    ...(isJsonObject(existing) ? existing : {}),
    workflow,
  };
}
