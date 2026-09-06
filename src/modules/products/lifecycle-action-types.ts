import type { ProductLifecycleErrorCode } from "./product-lifecycle-errors";
import type {
  ProductLifecycleOperation,
  ProductLifecycleResultDto,
} from "./product-lifecycle-types";

export type ProductLifecycleActionState = {
  result: ProductLifecycleResultDto | null;
  operation: ProductLifecycleOperation | null;
  errorCode:
    | ProductLifecycleErrorCode
    | "FORBIDDEN"
    | "UNAUTHORIZED"
    | "RATE_LIMITED"
    | null;
};

export const initialProductLifecycleActionState: ProductLifecycleActionState = {
  result: null,
  operation: null,
  errorCode: null,
};
