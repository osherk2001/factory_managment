import { ApplicationError } from "@/shared/errors";

import type { WorkflowStageSelectionDto } from "./workflow-types";

export const WORKFLOW_ERROR_CODES = {
  INVALID_WORKFLOW_INPUT: "INVALID_WORKFLOW_INPUT",
  WORKFLOW_NOT_FOUND: "WORKFLOW_NOT_FOUND",
  WORKFLOW_NOT_ACTIVE: "WORKFLOW_NOT_ACTIVE",
  WORKFLOW_NAME_CONFLICT: "WORKFLOW_NAME_CONFLICT",
  WORKFLOW_VERSION_CONFLICT: "WORKFLOW_VERSION_CONFLICT",
  WORKFLOW_ROLE_NOT_AVAILABLE: "WORKFLOW_ROLE_NOT_AVAILABLE",
  WORKFLOW_STAGE_NOT_AVAILABLE: "WORKFLOW_STAGE_NOT_AVAILABLE",
  WORKFLOW_STAGE_SELECTION_REQUIRED: "WORKFLOW_STAGE_SELECTION_REQUIRED",
  WORKFLOW_INVALID: "WORKFLOW_INVALID",
} as const;

export type WorkflowErrorCode =
  (typeof WORKFLOW_ERROR_CODES)[keyof typeof WORKFLOW_ERROR_CODES];

const DEFAULT_MESSAGES: Record<WorkflowErrorCode, string> = {
  INVALID_WORKFLOW_INPUT: "The workflow details are not valid.",
  WORKFLOW_NOT_FOUND: "The workflow is not available.",
  WORKFLOW_NOT_ACTIVE: "The workflow is not active.",
  WORKFLOW_NAME_CONFLICT: "A workflow with this name already exists.",
  WORKFLOW_VERSION_CONFLICT: "The workflow version could not be created.",
  WORKFLOW_ROLE_NOT_AVAILABLE: "A mapped production role is not available.",
  WORKFLOW_STAGE_NOT_AVAILABLE: "The workflow stage is not available.",
  WORKFLOW_STAGE_SELECTION_REQUIRED: "Choose the workflow stage for this work.",
  WORKFLOW_INVALID: "The workflow configuration is invalid.",
};

export class WorkflowError extends ApplicationError {
  declare readonly code: WorkflowErrorCode;

  constructor(code: WorkflowErrorCode, message = DEFAULT_MESSAGES[code]) {
    super(code, message);
    this.name = "WorkflowError";
  }
}

export class WorkflowStageSelectionRequiredError extends WorkflowError {
  readonly selection: WorkflowStageSelectionDto;

  constructor(selection: WorkflowStageSelectionDto) {
    super(WORKFLOW_ERROR_CODES.WORKFLOW_STAGE_SELECTION_REQUIRED);
    this.name = "WorkflowStageSelectionRequiredError";
    this.selection = selection;
  }
}

export function isWorkflowError(error: unknown): error is WorkflowError {
  return error instanceof WorkflowError;
}

export function isWorkflowStageSelectionRequiredError(
  error: unknown,
): error is WorkflowStageSelectionRequiredError {
  return error instanceof WorkflowStageSelectionRequiredError;
}
