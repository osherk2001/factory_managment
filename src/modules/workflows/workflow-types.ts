export type WorkflowMovement =
  "INITIAL" | "FORWARD" | "BACKWARD" | "REPEAT" | "UNMAPPED";

export type WorkflowProductionRoleDto = {
  id: string;
  code: string;
  name: string;
};

export type WorkflowStageDto = {
  id: string;
  code: string;
  name: string;
  position: number;
  productionRole: WorkflowProductionRoleDto | null;
};

export type ProductWorkflowDto = {
  snapshotId: string;
  templateId: string | null;
  templateName: string | null;
  sourceVersion: number | null;
  currentStage: WorkflowStageDto | null;
  expectedNextStage: WorkflowStageDto | null;
  stages: readonly WorkflowStageDto[];
};

export type WorkflowTemplateStageInput = {
  code: string;
  name: string;
  position: number;
  productionRoleId?: string | null;
};

export type CreateWorkflowTemplateInput = {
  name: string;
  stages: readonly WorkflowTemplateStageInput[];
};

export type CreateWorkflowTemplateVersionInput = {
  sourceTemplateId: string;
  stages: readonly WorkflowTemplateStageInput[];
};

export type WorkflowTemplateDto = {
  id: string;
  name: string;
  version: number;
  isActive: boolean;
  createdAt: string;
  stages: readonly WorkflowStageDto[];
};

export type WorkflowStageSelectionDto = {
  snapshotId: string;
  productId: string;
  currentStage: WorkflowStageDto | null;
  expectedNextStage: WorkflowStageDto | null;
  candidates: readonly WorkflowStageDto[];
};

export type WorkflowTransitionMetadata = {
  schemaVersion: 1;
  snapshotId: string;
  movement: WorkflowMovement;
  expectedStageId: string | null;
  actualStageId: string | null;
  deviation: boolean;
  isRework: boolean;
  actualProductionRoleId?: string;
};

export type ResolvedWorkflowStage = {
  kind: "NO_WORKFLOW" | "UNMAPPED_ROLE" | "RESOLVED";
  snapshotId: string | null;
  currentStage: WorkflowStageDto | null;
  expectedNextStage: WorkflowStageDto | null;
  stage: WorkflowStageDto | null;
  movement: WorkflowMovement | null;
  metadata: WorkflowTransitionMetadata | null;
};

export type WorkflowStageResolution =
  | ResolvedWorkflowStage
  | {
      kind: "SELECTION_REQUIRED";
      selection: WorkflowStageSelectionDto;
    };
