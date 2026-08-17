import { ApplicationError } from "@/shared/errors";

export const PRODUCT_LIFECYCLE_ERROR_CODES = {
  INVALID_LIFECYCLE_INPUT: "INVALID_LIFECYCLE_INPUT",
  PRODUCT_NOT_FOUND: "PRODUCT_NOT_FOUND",
  PRODUCT_STATE_CHANGED: "PRODUCT_STATE_CHANGED",
  PRODUCT_NOT_FINISHABLE: "PRODUCT_NOT_FINISHABLE",
  PRODUCT_NOT_COMPLETABLE: "PRODUCT_NOT_COMPLETABLE",
  PRODUCT_NOT_REOPENABLE: "PRODUCT_NOT_REOPENABLE",
  PRODUCT_NOT_CANCELLABLE: "PRODUCT_NOT_CANCELLABLE",
  PRODUCT_NOT_RESTORABLE: "PRODUCT_NOT_RESTORABLE",
  PRODUCT_NOT_TRASHABLE: "PRODUCT_NOT_TRASHABLE",
  ACTIVE_ASSIGNMENT_REQUIRED: "ACTIVE_ASSIGNMENT_REQUIRED",
  ACTIVE_ASSIGNMENT_CONFLICT: "ACTIVE_ASSIGNMENT_CONFLICT",
  IDEMPOTENCY_CONFLICT: "IDEMPOTENCY_CONFLICT",
  LIFECYCLE_FAILED: "LIFECYCLE_FAILED",
} as const;

export type ProductLifecycleErrorCode =
  (typeof PRODUCT_LIFECYCLE_ERROR_CODES)[keyof typeof PRODUCT_LIFECYCLE_ERROR_CODES];

const DEFAULT_MESSAGES: Record<ProductLifecycleErrorCode, string> = {
  INVALID_LIFECYCLE_INPUT: "The Product action input is not valid.",
  PRODUCT_NOT_FOUND: "The Product was not found.",
  PRODUCT_STATE_CHANGED: "The Product changed before this action completed.",
  PRODUCT_NOT_FINISHABLE: "This Product cannot be finished.",
  PRODUCT_NOT_COMPLETABLE: "This Product cannot be completed.",
  PRODUCT_NOT_REOPENABLE: "This Product cannot be returned to process.",
  PRODUCT_NOT_CANCELLABLE: "This Product cannot be cancelled.",
  PRODUCT_NOT_RESTORABLE: "This Product cannot be restored.",
  PRODUCT_NOT_TRASHABLE: "This Product cannot be moved to trash.",
  ACTIVE_ASSIGNMENT_REQUIRED: "An active Product assignment is required.",
  ACTIVE_ASSIGNMENT_CONFLICT:
    "The Product responsibility data is inconsistent.",
  IDEMPOTENCY_CONFLICT: "This action key was already used for another request.",
  LIFECYCLE_FAILED: "The Product action could not be completed.",
};

export class ProductLifecycleError extends ApplicationError {
  declare readonly code: ProductLifecycleErrorCode;

  constructor(
    code: ProductLifecycleErrorCode,
    message = DEFAULT_MESSAGES[code],
  ) {
    super(code, message);
    this.name = "ProductLifecycleError";
  }
}

export function isProductLifecycleError(
  error: unknown,
): error is ProductLifecycleError {
  return error instanceof ProductLifecycleError;
}
