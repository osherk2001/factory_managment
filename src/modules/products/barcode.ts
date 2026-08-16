import "server-only";

import { randomBytes } from "node:crypto";

import { ProductCreationError, PRODUCT_ERROR_CODES } from "./product-errors";

export const BARCODE_GENERATION_ATTEMPTS = 3;

export function generateBarcodeValue(): string {
  try {
    return `ff_${randomBytes(24).toString("base64url")}`;
  } catch {
    throw new ProductCreationError(
      PRODUCT_ERROR_CODES.BARCODE_GENERATION_FAILED,
    );
  }
}
