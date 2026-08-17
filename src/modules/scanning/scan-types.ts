export type ScanOutcome =
  | "RECEIVED"
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

export type ActiveProductionHandlingContextDto = {
  employee: ScanEmployeeDto;
  productionRole: ScanProductionRoleDto;
  handlingLocation: ScanLocationDto;
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
};

export type WorkerScanRequest = {
  barcode: string;
  idempotencyKey: string;
};

export type WorkerTakeoverRequest = {
  barcode: string;
  expectedVersion: number;
  idempotencyKey: string;
};
