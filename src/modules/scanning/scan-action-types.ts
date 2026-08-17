import type { WorkerContextErrorCode } from "@/modules/worker-context";

import type { ScanErrorCode } from "./scan-errors";
import type { WorkerScanResult } from "./scan-types";

export type WorkerScanActionState = {
  result: WorkerScanResult | null;
  errorCode:
    | ScanErrorCode
    | WorkerContextErrorCode
    | "FORBIDDEN"
    | "UNAUTHORIZED"
    | null;
};

export const initialWorkerScanActionState: WorkerScanActionState = {
  result: null,
  errorCode: null,
};
