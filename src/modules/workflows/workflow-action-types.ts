import type { WorkflowErrorCode } from "./workflow-errors";

export type WorkflowActionState = {
  success: boolean;
  errorCode: WorkflowErrorCode | "FORBIDDEN" | "UNAUTHORIZED" | null;
};

export const initialWorkflowActionState: WorkflowActionState = {
  success: false,
  errorCode: null,
};
