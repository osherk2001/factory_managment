"use server";

import { isFactoryFlowAuthError } from "@/modules/auth/auth-errors";
import { isWorkerContextError } from "@/modules/worker-context";

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
  if (isWorkerScanError(error) || isWorkerContextError(error)) {
    return { result: null, errorCode: error.code };
  }

  if (isFactoryFlowAuthError(error)) {
    return {
      result: null,
      errorCode: error.code === "FORBIDDEN" ? "FORBIDDEN" : "UNAUTHORIZED",
    };
  }

  return { ...previousState, result: null, errorCode: "SCAN_FAILED" };
}

export async function scanProductAction(
  previousState: WorkerScanActionState,
  formData: FormData,
): Promise<WorkerScanActionState> {
  try {
    const result = await scanProduct({
      barcode: getString(formData, "barcode"),
      idempotencyKey: getString(formData, "idempotencyKey"),
    });

    return { result, errorCode: null };
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
    });

    return { result, errorCode: null };
  } catch (error) {
    return getErrorState(previousState, error);
  }
}

export async function workerScanAction(
  previousState: WorkerScanActionState,
  formData: FormData,
): Promise<WorkerScanActionState> {
  return getString(formData, "operation") === "takeover"
    ? takeOverProductAction(previousState, formData)
    : scanProductAction(previousState, formData);
}
