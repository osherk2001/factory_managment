export type ScanOutcome =
  | "RECEIVED"
  | "WORKFLOW_STAGE_SELECTION_REQUIRED"
  | "FINISH_CONFIRMATION_REQUIRED"
  | "TAKEOVER_CONFIRMATION_REQUIRED"
  | "COMPLETED_SAME_DEPARTMENT"
  | "COMPLETED_OTHER_DEPARTMENT"
  | "COMPLETED_CONTEXT_UNKNOWN"
  | "PRODUCT_NOT_RECEIVABLE";

export type ScanProductStatus =
  | "CREATED"
  | "IN_PROGRESS"
  | "READY_FOR_HANDOFF"
  | "COMPLETED"
  | "CANCELLED"
  | "TRASHED";

export type ScanEmployeeDto = {
  id: string;
  displayName: string;
};

export type ScanProductionRoleDto = {
  id: string;
  code: string;
  name: string;
};

export type ScanLocationDto = {
  id: string;
  code: string;
  name: string;
  departmentId: string | null;
};

export type ScanCompletedByDto = {
  displayName: string;
};

export type ActiveProductionHandlingContextDto = {
  employee: ScanEmployeeDto;
  productionRole: ScanProductionRoleDto;
  handlingLocation: ScanLocationDto;
  canReturnToProcess: boolean;
};

export type WorkerScanResult = {
  productId: string;
  barcode: string;
  serialNumber: string;
  status: ScanProductStatus;
  version: number;
  scanOutcome: ScanOutcome;
  currentWorker: ScanEmployeeDto | null;
  currentRole: ScanProductionRoleDto | null;
  currentLocation: ScanLocationDto | null;
  completedAt: string | null;
  completedBy: ScanCompletedByDto | null;
  workflow: ScanWorkflowDto | null;
};

export type ScanWorkflowStageDto = {
  id: string;
  code: string;
  name: string;
  position: number;
  productionRole: ScanProductionRoleDto | null;
};

export type ScanWorkflowDto = {
  snapshotId: string;
  templateName: string | null;
  sourceVersion: number | null;
  currentStage: ScanWorkflowStageDto | null;
  expectedNextStage: ScanWorkflowStageDto | null;
  actualStage: ScanWorkflowStageDto | null;
  movement: "INITIAL" | "FORWARD" | "BACKWARD" | "REPEAT" | "UNMAPPED" | null;
  deviation: boolean;
  isRework: boolean;
  selectionCandidates: readonly ScanWorkflowStageDto[];
  selectionAction: "RECEIVE" | "TAKEOVER" | null;
};

export type WorkerScanRequest = {
  barcode: string;
  idempotencyKey: string;
  selectedWorkflowStageId?: string | null;
};

export type WorkerTakeoverRequest = {
  barcode: string;
  expectedVersion: number;
  idempotencyKey: string;
  selectedWorkflowStageId?: string | null;
};
