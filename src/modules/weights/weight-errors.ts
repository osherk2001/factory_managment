import { ApplicationError } from "@/shared/errors";

export const WEIGHT_ERROR_CODES = {
  INVALID_INPUT: "WEIGHT_INVALID_INPUT",
  PRODUCT_NOT_FOUND: "WEIGHT_PRODUCT_NOT_FOUND",
  EVENT_NOT_FOUND: "WEIGHT_EVENT_NOT_FOUND",
  CORRECTION_TARGET_INVALID: "WEIGHT_CORRECTION_TARGET_INVALID",
  IDEMPOTENCY_CONFLICT: "WEIGHT_IDEMPOTENCY_CONFLICT",
  FAILED: "WEIGHT_FAILED",
} as const;

export class WeightError extends ApplicationError {
  constructor(code: string) {
    super(code, code);
    this.name = "WeightError";
  }
}

export function isWeightError(error: unknown): error is WeightError {
  return error instanceof WeightError;
}
