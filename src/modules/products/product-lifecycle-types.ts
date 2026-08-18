import type { ProductWorkflowDto } from "@/modules/workflows";

export type ProductLifecycleStatus =
  | "CREATED"
  | "IN_PROGRESS"
  | "READY_FOR_HANDOFF"
  | "COMPLETED"
  | "CANCELLED"
  | "TRASHED";

export type ProductLifecycleWorkerDto = {
  id: string;
  displayName: string;
};

export type ProductLifecycleRoleDto = {
  id: string;
  code: string;
  name: string;
};

export type ProductLifecycleLocationDto = {
  id: string;
  code: string;
  name: string;
  departmentId: string | null;
};

export type ProductLifecycleResultDto = {
  productId: string;
  serialNumber: string;
  status: ProductLifecycleStatus;
  version: number;
  currentWorker: ProductLifecycleWorkerDto | null;
  currentRole: ProductLifecycleRoleDto | null;
  currentLocation: ProductLifecycleLocationDto | null;
  completedAt: string | null;
  cancelledAt: string | null;
  trashedAt: string | null;
  workflow: ProductWorkflowDto | null;
};

export type ProductLifecycleOperation =
  | "products.finish"
  | "products.complete"
  | "products.return_to_process"
  | "products.cancel"
  | "products.restore"
  | "products.trash";

export type ProductLifecycleInput = {
  productId: string;
  expectedVersion: number;
  idempotencyKey: string;
};

export type ReturnProductToProcessInput = ProductLifecycleInput & {
  selectedWorkflowStageId?: string | null;
};
