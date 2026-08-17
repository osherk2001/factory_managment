"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import type { FormEvent } from "react";

import { defaultLocale, getMessages } from "@/lib/i18n";
import { WORKER_CONTEXT_ERROR_CODES } from "@/modules/worker-context";

import { workerScanAction } from "./actions";
import {
  initialWorkerScanActionState,
  type WorkerScanActionState,
} from "./scan-action-types";
import type {
  ActiveProductionHandlingContextDto,
  ScanOutcome,
  WorkerScanResult,
} from "./scan-types";

const messages = getMessages(defaultLocale);

function setFreshIdempotencyKey(event: FormEvent<HTMLFormElement>) {
  const input = event.currentTarget.elements.namedItem("idempotencyKey");
  if (input instanceof HTMLInputElement) {
    input.value = crypto.randomUUID();
  }
}

function outcomeMessage(outcome: ScanOutcome): string {
  switch (outcome) {
    case "RECEIVED":
      return messages.worker.scanSuccess;
    case "FINISH_CONFIRMATION_REQUIRED":
      return messages.worker.finishConfirmationRequired;
    case "TAKEOVER_CONFIRMATION_REQUIRED":
      return messages.worker.takeoverConfirmationRequired;
    case "COMPLETED_SAME_DEPARTMENT":
      return messages.worker.completedSameDepartment;
    case "COMPLETED_OTHER_DEPARTMENT":
      return messages.worker.completedOtherDepartment;
    case "COMPLETED_CONTEXT_UNKNOWN":
      return messages.worker.completedContextUnknown;
    case "PRODUCT_NOT_RECEIVABLE":
      return messages.worker.productNotReceivable;
  }
}

function statusMessage(status: WorkerScanResult["status"]): string {
  switch (status) {
    case "IN_PROGRESS":
      return messages.worker.inProgress;
    case "CREATED":
      return messages.worker.created;
    case "READY_FOR_HANDOFF":
      return messages.worker.readyForHandoff;
    case "COMPLETED":
      return messages.worker.completed;
    case "CANCELLED":
      return messages.worker.cancelled;
    case "TRASHED":
      return messages.worker.trashed;
  }
}

function errorMessage(
  errorCode: WorkerScanActionState["errorCode"],
): string | null {
  switch (errorCode) {
    case "BARCODE_REQUIRED":
      return messages.worker.barcodeRequired;
    case "BARCODE_NOT_FOUND":
      return messages.worker.barcodeNotFound;
    case "WORK_LOCATION_REQUIRED":
      return messages.worker.workLocationRequired;
    case "WORK_LOCATION_INACTIVE":
      return messages.worker.workLocationInactive;
    case "SCAN_CONFLICT":
      return messages.worker.scanConflict;
    case "SCAN_FAILED":
    case "INVALID_SCAN_INPUT":
    case "IDEMPOTENCY_CONFLICT":
      return messages.worker.scanFailed;
    case "PRODUCT_NOT_RECEIVABLE":
    case "TAKEOVER_NOT_ALLOWED":
      return messages.worker.productNotReceivable;
    case "FORBIDDEN":
    case "UNAUTHORIZED":
      return messages.worker.scanUnauthorized;
    case WORKER_CONTEXT_ERROR_CODES.EMPLOYEE_PROFILE_REQUIRED:
    case WORKER_CONTEXT_ERROR_CODES.EMPLOYEE_INACTIVE:
    case WORKER_CONTEXT_ERROR_CODES.NO_PRODUCTION_ROLES:
    case WORKER_CONTEXT_ERROR_CODES.PRODUCTION_ROLE_NOT_ASSIGNED:
    case WORKER_CONTEXT_ERROR_CODES.PRODUCTION_ROLE_NOT_AVAILABLE:
    case WORKER_CONTEXT_ERROR_CODES.ACTIVE_PRODUCTION_ROLE_REQUIRED:
      return messages.worker.scanUnavailable;
    default:
      return null;
  }
}

function ResultDetails({ result }: { result: WorkerScanResult }) {
  return (
    <div className="space-y-4" data-testid="scan-result">
      <div>
        <p className="text-lg font-semibold">{result.serialNumber}</p>
        <p aria-live="polite" className="mt-1 text-sm">
          {outcomeMessage(result.scanOutcome)}
        </p>
      </div>
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="font-medium text-muted-foreground">
            {messages.worker.scanProductStatus}
          </dt>
          <dd>{statusMessage(result.status)}</dd>
        </div>
        <div>
          <dt className="font-medium text-muted-foreground">
            {messages.worker.scanCurrentWorker}
          </dt>
          <dd>{result.currentWorker?.displayName ?? messages.worker.notSet}</dd>
        </div>
        <div>
          <dt className="font-medium text-muted-foreground">
            {messages.worker.scanCurrentRole}
          </dt>
          <dd>{result.currentRole?.name ?? messages.worker.notSet}</dd>
        </div>
        <div>
          <dt className="font-medium text-muted-foreground">
            {messages.worker.scanCurrentLocation}
          </dt>
          <dd>{result.currentLocation?.name ?? messages.worker.notSet}</dd>
        </div>
      </dl>
    </div>
  );
}

type WorkerScanFormAction = (formData: FormData) => void;

function TakeoverForm({
  result,
  barcode,
  formAction,
  isSubmitting,
}: {
  result: WorkerScanResult;
  barcode: string;
  formAction: WorkerScanFormAction;
  isSubmitting: boolean;
}) {
  const [initialIdempotencyKey] = useState(() => crypto.randomUUID());

  return (
    <section className="space-y-4 rounded-xl border border-amber-300 bg-amber-50 p-5">
      <ResultDetails result={result} />
      <form action={formAction} onSubmit={setFreshIdempotencyKey}>
        <input name="barcode" type="hidden" value={barcode} />
        <input name="expectedVersion" type="hidden" value={result.version} />
        <input name="operation" type="hidden" value="takeover" />
        <input
          defaultValue={initialIdempotencyKey}
          name="idempotencyKey"
          type="hidden"
        />
        <button
          className="min-h-14 w-full rounded-xl bg-primary px-5 py-3 text-base font-semibold text-primary-foreground"
          data-testid="takeover-confirm"
          disabled={isSubmitting}
          type="submit"
        >
          {isSubmitting
            ? messages.worker.takeoverSubmitting
            : messages.worker.takeoverAction}
        </button>
      </form>
    </section>
  );
}

export function WorkerScanPage({
  data,
}: {
  data: ActiveProductionHandlingContextDto;
}) {
  const [initialIdempotencyKey] = useState(() => crypto.randomUUID());
  const [state, formAction, isSubmitting] = useActionState(
    workerScanAction,
    initialWorkerScanActionState,
  );
  const scanError = errorMessage(state.errorCode);

  function handleScanSubmit(event: FormEvent<HTMLFormElement>) {
    setFreshIdempotencyKey(event);
  }

  return (
    <main className="min-h-screen px-4 py-8 sm:px-6 sm:py-12">
      <section className="mx-auto w-full max-w-2xl space-y-6">
        <header className="space-y-3">
          <Link className="text-sm underline" href="/app/worker">
            {messages.worker.myWork}
          </Link>
          <h1 className="text-3xl font-semibold" data-testid="scan-title">
            {messages.worker.scanTitle}
          </h1>
          <dl className="grid gap-3 rounded-xl border bg-white p-5 text-sm shadow-sm sm:grid-cols-2">
            <div>
              <dt className="font-medium text-muted-foreground">
                {messages.worker.activeProductionRole}
              </dt>
              <dd data-testid="scan-active-role">{data.productionRole.name}</dd>
            </div>
            <div>
              <dt className="font-medium text-muted-foreground">
                {messages.worker.scanHandlingLocation}
              </dt>
              <dd data-testid="scan-handling-location">
                {data.handlingLocation.name}
              </dd>
            </div>
          </dl>
        </header>

        <section className="space-y-4 rounded-xl border bg-white p-5 shadow-sm">
          <form action={formAction} onSubmit={handleScanSubmit}>
            <label className="grid gap-2 text-sm font-medium" htmlFor="barcode">
              {messages.worker.barcode}
              <input
                autoFocus
                className="min-h-14 rounded-xl border px-4 text-lg"
                data-testid="worker-scan-barcode"
                id="barcode"
                name="barcode"
                placeholder={messages.worker.barcode}
                type="text"
              />
            </label>
            <input
              defaultValue={initialIdempotencyKey}
              name="idempotencyKey"
              type="hidden"
            />
            <input name="operation" type="hidden" value="scan" />
            <button
              className="mt-4 min-h-14 w-full rounded-xl bg-primary px-5 py-3 text-base font-semibold text-primary-foreground"
              data-testid="worker-scan-submit"
              disabled={isSubmitting}
              type="submit"
            >
              {isSubmitting
                ? messages.worker.scanning
                : messages.worker.scanSubmit}
            </button>
          </form>

          {scanError ? (
            <p
              className="text-destructive text-sm"
              data-testid="scan-error"
              role="alert"
            >
              {scanError}
            </p>
          ) : null}

          {state.result ? (
            state.result.scanOutcome === "TAKEOVER_CONFIRMATION_REQUIRED" ? (
              <TakeoverForm
                barcode={state.result.barcode}
                formAction={formAction}
                isSubmitting={isSubmitting}
                result={state.result}
              />
            ) : (
              <ResultDetails result={state.result} />
            )
          ) : null}
        </section>
      </section>
    </main>
  );
}
