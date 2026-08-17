"use server";

import { isFactoryFlowAuthError } from "@/modules/auth/auth-errors";
import { isWorkerContextError } from "@/modules/worker-context";

import {
  cancelProduct,
  completeProduct,
  finishProduct,
  restoreProduct,
  returnCompletedProductToProcess,
  trashProduct,
} from "./server";
import { isProductLifecycleError } from "./product-lifecycle-errors";
import type { ProductLifecycleActionState } from "./lifecycle-action-types";
import type {
  ProductLifecycleInput,
  ProductLifecycleOperation,
} from "./product-lifecycle-types";

function getString(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function getInput(formData: FormData): ProductLifecycleInput {
  return {
    productId: getString(formData, "productId"),
    expectedVersion: Number(getString(formData, "expectedVersion")),
    idempotencyKey: getString(formData, "idempotencyKey"),
  };
}

function getOperation(formData: FormData): ProductLifecycleOperation | null {
  const operation = getString(formData, "operation");
  return operation === "products.finish" ||
    operation === "products.complete" ||
    operation === "products.return_to_process" ||
    operation === "products.cancel" ||
    operation === "products.restore" ||
    operation === "products.trash"
    ? operation
    : null;
}

function errorState(
  previousState: ProductLifecycleActionState,
  error: unknown,
): ProductLifecycleActionState {
  if (isProductLifecycleError(error)) {
    return {
      result: null,
      operation: previousState.operation,
      errorCode: error.code,
    };
  }

  if (isFactoryFlowAuthError(error)) {
    return {
      result: null,
      operation: previousState.operation,
      errorCode: error.code === "FORBIDDEN" ? "FORBIDDEN" : "UNAUTHORIZED",
    };
  }

  if (isWorkerContextError(error)) {
    return {
      result: null,
      operation: previousState.operation,
      errorCode: "LIFECYCLE_FAILED",
    };
  }

  return {
    result: null,
    operation: previousState.operation,
    errorCode: "LIFECYCLE_FAILED",
  };
}

async function runLifecycleAction(
  previousState: ProductLifecycleActionState,
  formData: FormData,
  expectedOperation?: ProductLifecycleOperation,
): Promise<ProductLifecycleActionState> {
  const operation = getOperation(formData);
  if (!operation || (expectedOperation && operation !== expectedOperation)) {
    return {
      result: null,
      operation: expectedOperation ?? previousState.operation,
      errorCode: "INVALID_LIFECYCLE_INPUT",
    };
  }

  try {
    const input = getInput(formData);
    const result =
      operation === "products.finish"
        ? await finishProduct(input)
        : operation === "products.complete"
          ? await completeProduct(input)
          : operation === "products.return_to_process"
            ? await returnCompletedProductToProcess(input)
            : operation === "products.cancel"
              ? await cancelProduct(input)
              : operation === "products.restore"
                ? await restoreProduct(input)
                : await trashProduct(input);

    return { result, operation, errorCode: null };
  } catch (error) {
    return errorState({ ...previousState, operation }, error);
  }
}

export async function finishProductAction(
  previousState: ProductLifecycleActionState,
  formData: FormData,
): Promise<ProductLifecycleActionState> {
  return runLifecycleAction(previousState, formData, "products.finish");
}

export async function productLifecycleAction(
  previousState: ProductLifecycleActionState,
  formData: FormData,
): Promise<ProductLifecycleActionState> {
  return runLifecycleAction(previousState, formData);
}
