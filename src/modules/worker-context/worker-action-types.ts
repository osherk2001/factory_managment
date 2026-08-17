import type { WorkerContextErrorCode } from "./worker-context.errors";

export type WorkerRoleSelectionActionState = {
  activeProductionRoleId: string | null;
  errorCode: WorkerContextErrorCode | "FORBIDDEN" | "UNAUTHORIZED" | null;
};

export const initialWorkerRoleSelectionActionState: WorkerRoleSelectionActionState =
  {
    activeProductionRoleId: null,
    errorCode: null,
  };
