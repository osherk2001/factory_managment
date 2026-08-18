"use server";

import { isFactoryFlowAuthError } from "@/modules/auth/auth-errors";
import {
  finishProduct,
  returnCompletedProductToProcess,
} from "@/modules/products/server";
import { isWorkerContextError } from "@/modules/worker-context";
import {
  isWorkflowError,
  isWorkflowStageSelectionRequiredError,
} from "@/modules/workflows/server";

import { isWorkerScanError } from "./scan-errors";
import { scanProduct, takeOverProduct } from "./server";
import type { WorkerScanActionState } from "./scan-action-types";

function getString(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function getErrorState(
  previousState: WorkerScanActionState,
  error: unknown,
): WorkerScanActionState {
  if (isWorkflowStageSelectionRequiredError(error)) {
    return {
      ...previousState,
      lifecycleResult: null,
      workflowSelection: {
        action: "RETURN_TO_PROCESS",
        selection: error.selection,
      },
      errorCode: error.code,
    };
  }

  if (
    isWorkerScanError(error) ||
    isWorkerContextError(error) ||
    isWorkflowError(error)
  ) {
    return {
      ...previousState,
      result: null,
      lifecycleResult: null,
      workflowSelection: null,
      errorCode: error.code,
    };
  }

  if (isFactoryFlowAuthError(error)) {
    return {
      ...previousState,
      result: null,
      lifecycleResult: null,
      workflowSelection: null,
      errorCode: error.code === "FORBIDDEN" ? "FORBIDDEN" : "UNAUTHORIZED",
    };
  }

  return {
    ...previousState,
    result: null,
    lifecycleResult: null,
    workflowSelection: null,
    errorCode: "SCAN_FAILED",
  };
}

export async function scanProductAction(
  previousState: WorkerScanActionState,
  formData: FormData,
): Promise<WorkerScanActionState> {
  try {
    const result = await scanProduct({
      barcode: getString(formData, "barcode"),
      idempotencyKey: getString(formData, "idempotencyKey"),
      selectedWorkflowStageId:
        getString(formData, "selectedWorkflowStageId") || null,
    });

    return {
      result,
      lifecycleResult: null,
      workflowSelection: null,
      errorCode: null,
    };
  } catch (error) {
    return getErrorState(previousState, error);
  }
}

export async function takeOverProductAction(
  previousState: WorkerScanActionState,
  formData: FormData,
): Promise<WorkerScanActionState> {
  try {
    const expectedVersion = Number(getString(formData, "expectedVersion"));
    const result = await takeOverProduct({
      barcode: getString(formData, "barcode"),
      expectedVersion,
      idempotencyKey: getString(formData, "idempotencyKey"),
      selectedWorkflowStageId:
        getString(formData, "selectedWorkflowStageId") || null,
    });

    return {
      result,
      lifecycleResult: null,
      workflowSelection: null,
      errorCode: null,
    };
  } catch (error) {
    return getErrorState(previousState, error);
  }
}

export async function workerScanAction(
  previousState: WorkerScanActionState,
  formData: FormData,
): Promise<WorkerScanActionState> {
  const operation = getString(formData, "operation");
  if (operation === "takeover") {
    return takeOverProductAction(previousState, formData);
  }
  if (operation === "finish" || operation === "return_to_process") {
    try {
      const input = {
        productId: getString(formData, "productId"),
        expectedVersion: Number(getString(formData, "expectedVersion")),
        idempotencyKey: getString(formData, "idempotencyKey"),
      };
      const lifecycleResult =
        operation === "finish"
          ? await finishProduct(input)
          : await returnCompletedProductToProcess({
              ...input,
              selectedWorkflowStageId:
                getString(formData, "selectedWorkflowStageId") || null,
            });
      return {
        ...previousState,
        result: null,
        lifecycleResult,
        workflowSelection: null,
        errorCode: null,
      };
    } catch (error) {
      return getErrorState(previousState, error);
    }
  }

  return scanProductAction(previousState, formData);
}
