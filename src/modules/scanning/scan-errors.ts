import { ApplicationError } from "@/shared/errors";

export const SCAN_ERROR_CODES = {
  BARCODE_REQUIRED: "BARCODE_REQUIRED",
  BARCODE_NOT_FOUND: "BARCODE_NOT_FOUND",
  WORK_LOCATION_REQUIRED: "WORK_LOCATION_REQUIRED",
  WORK_LOCATION_INACTIVE: "WORK_LOCATION_INACTIVE",
  PRODUCT_NOT_RECEIVABLE: "PRODUCT_NOT_RECEIVABLE",
  TAKEOVER_NOT_ALLOWED: "TAKEOVER_NOT_ALLOWED",
  SCAN_CONFLICT: "SCAN_CONFLICT",
  IDEMPOTENCY_CONFLICT: "IDEMPOTENCY_CONFLICT",
  INVALID_SCAN_INPUT: "INVALID_SCAN_INPUT",
  SCAN_FAILED: "SCAN_FAILED",
} as const;

export type ScanErrorCode =
  (typeof SCAN_ERROR_CODES)[keyof typeof SCAN_ERROR_CODES];

const DEFAULT_MESSAGES: Record<ScanErrorCode, string> = {
  BARCODE_REQUIRED: "A barcode is required.",
  BARCODE_NOT_FOUND: "The barcode was not found.",
  WORK_LOCATION_REQUIRED: "A handling location is required.",
  WORK_LOCATION_INACTIVE: "The handling location is inactive.",
  PRODUCT_NOT_RECEIVABLE: "This Product cannot be received.",
  TAKEOVER_NOT_ALLOWED: "This Product cannot be taken over.",
  SCAN_CONFLICT: "The Product changed while it was being scanned.",
  IDEMPOTENCY_CONFLICT: "This scan key was already used for another request.",
  INVALID_SCAN_INPUT: "The scan input is not valid.",
  SCAN_FAILED: "The scan could not be completed.",
};

export class WorkerScanError extends ApplicationError {
  declare readonly code: ScanErrorCode;

  constructor(code: ScanErrorCode, message = DEFAULT_MESSAGES[code]) {
    super(code, message);
    this.name = "WorkerScanError";
  }
}

export function isWorkerScanError(error: unknown): error is WorkerScanError {
  return error instanceof WorkerScanError;
}
