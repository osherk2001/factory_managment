import { z } from "zod";

import { WorkerScanError, SCAN_ERROR_CODES } from "./scan-errors";
import type { WorkerScanRequest, WorkerTakeoverRequest } from "./scan-types";

const barcodeSchema = z.string().trim().min(1).max(255);
const idempotencyKeySchema = z.string().trim().min(1).max(255);
const optionalStageIdSchema = z.string().uuid().nullable().optional();

function parseSelectedWorkflowStageId(value: unknown): string | null {
  const normalized = value === "" || value === undefined ? null : value;
  const parsed = optionalStageIdSchema.safeParse(normalized);
  if (!parsed.success) {
    throw new WorkerScanError(SCAN_ERROR_CODES.INVALID_SCAN_INPUT);
  }
  return parsed.data ?? null;
}

export function normalizeBarcode(value: unknown): string {
  const parsed = barcodeSchema.safeParse(value);
  if (!parsed.success) {
    throw new WorkerScanError(
      typeof value === "string" && value.trim().length === 0
        ? SCAN_ERROR_CODES.BARCODE_REQUIRED
        : SCAN_ERROR_CODES.INVALID_SCAN_INPUT,
    );
  }

  return parsed.data;
}

export function parseWorkerScanRequest(input: unknown): WorkerScanRequest {
  if (!input || typeof input !== "object") {
    throw new WorkerScanError(SCAN_ERROR_CODES.INVALID_SCAN_INPUT);
  }

  const candidate = input as Record<string, unknown>;
  return {
    barcode: normalizeBarcode(candidate.barcode),
    idempotencyKey: parseIdempotencyKey(candidate.idempotencyKey),
    selectedWorkflowStageId: parseSelectedWorkflowStageId(
      candidate.selectedWorkflowStageId,
    ),
  };
}

export function parseWorkerTakeoverRequest(
  input: unknown,
): WorkerTakeoverRequest {
  if (!input || typeof input !== "object") {
    throw new WorkerScanError(SCAN_ERROR_CODES.INVALID_SCAN_INPUT);
  }

  const candidate = input as Record<string, unknown>;
  const expectedVersion = z
    .number()
    .int()
    .nonnegative()
    .safeParse(candidate.expectedVersion);
  if (!expectedVersion.success) {
    throw new WorkerScanError(SCAN_ERROR_CODES.INVALID_SCAN_INPUT);
  }

  return {
    barcode: normalizeBarcode(candidate.barcode),
    expectedVersion: expectedVersion.data,
    idempotencyKey: parseIdempotencyKey(candidate.idempotencyKey),
    selectedWorkflowStageId: parseSelectedWorkflowStageId(
      candidate.selectedWorkflowStageId,
    ),
  };
}

function parseIdempotencyKey(value: unknown): string {
  const parsed = idempotencyKeySchema.safeParse(value);
  if (!parsed.success) {
    throw new WorkerScanError(SCAN_ERROR_CODES.INVALID_SCAN_INPUT);
  }
  return parsed.data;
}
