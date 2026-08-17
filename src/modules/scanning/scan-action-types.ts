import type { WorkerContextErrorCode } from "@/modules/worker-context";
import type { ProductLifecycleErrorCode } from "@/modules/products";
import type { ProductLifecycleResultDto } from "@/modules/products";

import type { ScanErrorCode } from "./scan-errors";
import type { WorkerScanResult } from "./scan-types";

export type WorkerScanActionState = {
  result: WorkerScanResult | null;
  lifecycleResult: ProductLifecycleResultDto | null;
  errorCode:
    | ScanErrorCode
    | WorkerContextErrorCode
    | ProductLifecycleErrorCode
    | "FORBIDDEN"
    | "UNAUTHORIZED"
    | null;
};

export const initialWorkerScanActionState: WorkerScanActionState = {
  result: null,
  lifecycleResult: null,
  errorCode: null,
};
