import type { WorkerContextErrorCode } from "@/modules/worker-context";
import type { ProductLifecycleErrorCode } from "@/modules/products";
import type { ProductLifecycleResultDto } from "@/modules/products";
import type { WorkflowErrorCode } from "@/modules/workflows/server";
import type { WorkflowStageSelectionDto } from "@/modules/workflows";

import type { ScanErrorCode } from "./scan-errors";
import type { WorkerScanResult } from "./scan-types";

export type WorkerScanActionState = {
  result: WorkerScanResult | null;
  lifecycleResult: ProductLifecycleResultDto | null;
  workflowSelection: {
    action: "RETURN_TO_PROCESS";
    selection: WorkflowStageSelectionDto;
  } | null;
  errorCode:
    | ScanErrorCode
    | WorkerContextErrorCode
    | ProductLifecycleErrorCode
    | WorkflowErrorCode
    | "FORBIDDEN"
    | "UNAUTHORIZED"
    | null;
};

export const initialWorkerScanActionState: WorkerScanActionState = {
  result: null,
  lifecycleResult: null,
  workflowSelection: null,
  errorCode: null,
};
