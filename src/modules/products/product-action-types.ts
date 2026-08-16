import type { ProductErrorCode } from "./product-errors";
import type { CreatedProductDto } from "./product-types";

export type ProductCreationActionState = {
  product: CreatedProductDto | null;
  errorCode: ProductErrorCode | "UNAUTHORIZED" | null;
};

export const initialProductCreationActionState: ProductCreationActionState = {
  product: null,
  errorCode: null,
};
