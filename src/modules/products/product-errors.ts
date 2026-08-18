import { ApplicationError } from "@/shared/errors";

export const PRODUCT_ERROR_CODES = {
  INVALID_PRODUCT_INPUT: "INVALID_PRODUCT_INPUT",
  PRODUCT_ORDER_NOT_FOUND: "PRODUCT_ORDER_NOT_FOUND",
  PRODUCT_TYPE_NOT_FOUND: "PRODUCT_TYPE_NOT_FOUND",
  PRODUCT_TYPE_INACTIVE: "PRODUCT_TYPE_INACTIVE",
  PRODUCT_WORKFLOW_NOT_AVAILABLE: "PRODUCT_WORKFLOW_NOT_AVAILABLE",
  PRODUCT_WORKFLOW_INVALID: "PRODUCT_WORKFLOW_INVALID",
  IDEMPOTENCY_CONFLICT: "IDEMPOTENCY_CONFLICT",
  SERIAL_ALLOCATION_FAILED: "SERIAL_ALLOCATION_FAILED",
  BARCODE_GENERATION_FAILED: "BARCODE_GENERATION_FAILED",
  PRODUCT_CREATION_FAILED: "PRODUCT_CREATION_FAILED",
} as const;

export type ProductErrorCode =
  (typeof PRODUCT_ERROR_CODES)[keyof typeof PRODUCT_ERROR_CODES];

const DEFAULT_MESSAGES: Record<ProductErrorCode, string> = {
  INVALID_PRODUCT_INPUT: "The product details are not valid.",
  PRODUCT_ORDER_NOT_FOUND: "The production order is not available.",
  PRODUCT_TYPE_NOT_FOUND: "The product type is not available.",
  PRODUCT_TYPE_INACTIVE: "The selected product type is inactive.",
  PRODUCT_WORKFLOW_NOT_AVAILABLE: "The selected workflow is not available.",
  PRODUCT_WORKFLOW_INVALID: "The selected workflow is invalid.",
  IDEMPOTENCY_CONFLICT:
    "This submission key was already used for different details.",
  SERIAL_ALLOCATION_FAILED: "A product serial number could not be allocated.",
  BARCODE_GENERATION_FAILED: "A product barcode could not be generated.",
  PRODUCT_CREATION_FAILED: "The product could not be created.",
};

export class ProductCreationError extends ApplicationError {
  declare readonly code: ProductErrorCode;

  constructor(code: ProductErrorCode, message = DEFAULT_MESSAGES[code]) {
    super(code, message);
    this.name = "ProductCreationError";
  }
}

export function isProductCreationError(
  error: unknown,
): error is ProductCreationError {
  return error instanceof ProductCreationError;
}
