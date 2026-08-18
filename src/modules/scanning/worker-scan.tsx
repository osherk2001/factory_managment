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
    case "WORKFLOW_STAGE_SELECTION_REQUIRED":
      return messages.worker.workflowStageSelectionRequired;
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
    case "INVALID_LIFECYCLE_INPUT":
    case "IDEMPOTENCY_CONFLICT":
      return messages.worker.scanFailed;
    case "PRODUCT_STATE_CHANGED":
      return messages.worker.productStateChanged;
    case "PRODUCT_NOT_FINISHABLE":
    case "PRODUCT_NOT_COMPLETABLE":
    case "PRODUCT_NOT_REOPENABLE":
    case "PRODUCT_NOT_CANCELLABLE":
    case "PRODUCT_NOT_RESTORABLE":
    case "PRODUCT_NOT_TRASHABLE":
    case "ACTIVE_ASSIGNMENT_REQUIRED":
    case "ACTIVE_ASSIGNMENT_CONFLICT":
    case "LIFECYCLE_FAILED":
      return messages.worker.finishFailed;
    case "PRODUCT_NOT_RECEIVABLE":
    case "TAKEOVER_NOT_ALLOWED":
      return messages.worker.productNotReceivable;
    case "WORKFLOW_STAGE_NOT_AVAILABLE":
    case "WORKFLOW_INVALID":
      return messages.worker.workflowStageUnavailable;
    case "WORKFLOW_STAGE_SELECTION_REQUIRED":
      return null;
    case "INVALID_WORKFLOW_INPUT":
    case "WORKFLOW_NOT_FOUND":
    case "WORKFLOW_NOT_ACTIVE":
    case "WORKFLOW_NAME_CONFLICT":
    case "WORKFLOW_VERSION_CONFLICT":
    case "WORKFLOW_ROLE_NOT_AVAILABLE":
      return messages.worker.scanFailed;
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
        {result.completedBy ? (
          <div data-testid="completed-by">
            <dt className="font-medium text-muted-foreground">
              {messages.worker.completedBy}
            </dt>
            <dd>{result.completedBy.displayName}</dd>
          </div>
        ) : null}
        {result.workflow ? (
          <>
            <div>
              <dt className="font-medium text-muted-foreground">
                {messages.worker.currentWorkflowStage}
              </dt>
              <dd data-testid="scan-current-stage">
                {result.workflow.currentStage?.name ?? messages.worker.notSet}
              </dd>
            </div>
            <div>
              <dt className="font-medium text-muted-foreground">
                {messages.worker.expectedWorkflowStage}
              </dt>
              <dd data-testid="scan-expected-stage">
                {result.workflow.expectedNextStage?.name ??
                  messages.worker.notSet}
              </dd>
            </div>
            {result.workflow.deviation ? (
              <div data-testid="workflow-deviation">
                <dt className="font-medium text-muted-foreground">
                  {messages.worker.workflowDeviation}
                </dt>
                <dd>{messages.worker.yes}</dd>
              </div>
            ) : null}
          </>
        ) : null}
      </dl>
    </div>
  );
}

function LifecycleResultDetails({
  result,
}: {
  result: NonNullable<WorkerScanActionState["lifecycleResult"]>;
}) {
  const status =
    result.status === "READY_FOR_HANDOFF"
      ? messages.worker.readyForHandoff
      : result.status === "IN_PROGRESS"
        ? messages.worker.inProgress
        : result.status === "COMPLETED"
          ? messages.worker.completed
          : result.status === "CANCELLED"
            ? messages.worker.cancelled
            : result.status === "TRASHED"
              ? messages.worker.trashed
              : messages.worker.created;

  return (
    <div className="space-y-4" data-testid="lifecycle-result">
      <p aria-live="polite" className="text-lg font-semibold">
        {result.status === "READY_FOR_HANDOFF"
          ? messages.worker.workFinished
          : messages.worker.returnedToProcess}
      </p>
      <p>
        {result.serialNumber} · {status}
      </p>
    </div>
  );
}

type WorkerScanFormAction = (formData: FormData) => void;

function WorkflowStageSelection({
  action,
  barcode,
  candidates,
  expectedVersion,
  formAction,
  isSubmitting,
  productId,
}: {
  action: "RECEIVE" | "TAKEOVER" | "RETURN_TO_PROCESS";
  barcode: string;
  candidates: NonNullable<WorkerScanResult["workflow"]>["selectionCandidates"];
  expectedVersion: number;
  formAction: WorkerScanFormAction;
  isSubmitting: boolean;
  productId: string;
}) {
  return (
    <section
      className="space-y-4 rounded-xl border border-amber-300 bg-amber-50 p-5"
      data-testid="workflow-stage-selection"
    >
      <h2 className="text-xl font-semibold">
        {messages.worker.chooseWorkflowStage}
      </h2>
      <p className="text-sm">
        {messages.worker.workflowStageSelectionRequired}
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {candidates.map((stage) => (
          <form
            action={formAction}
            key={stage.id}
            onSubmit={setFreshIdempotencyKey}
          >
            <input
              defaultValue={`${action}:${productId}:${expectedVersion}:${stage.id}`}
              name="idempotencyKey"
              type="hidden"
            />
            <input
              name="operation"
              type="hidden"
              value={
                action === "RECEIVE"
                  ? "scan"
                  : action === "TAKEOVER"
                    ? "takeover"
                    : "return_to_process"
              }
            />
            <input name="barcode" type="hidden" value={barcode} />
            <input name="productId" type="hidden" value={productId} />
            <input
              name="expectedVersion"
              type="hidden"
              value={expectedVersion}
            />
            <input
              name="selectedWorkflowStageId"
              type="hidden"
              value={stage.id}
            />
            <button
              className="min-h-14 w-full rounded-xl border bg-white px-5 py-3 text-start text-base font-semibold"
              data-testid="workflow-stage-option"
              disabled={isSubmitting}
              type="submit"
            >
              <span className="block">{stage.name}</span>
              <span className="mt-1 block text-xs font-normal text-muted-foreground">
                {stage.code} · {stage.position}
              </span>
            </button>
          </form>
        ))}
      </div>
    </section>
  );
}

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

function FinishConfirmation({
  result,
  formAction,
  isSubmitting,
}: {
  result: WorkerScanResult;
  formAction: WorkerScanFormAction;
  isSubmitting: boolean;
}) {
  const [cancelled, setCancelled] = useState(false);
  const [initialIdempotencyKey] = useState(() => crypto.randomUUID());

  if (cancelled) {
    return (
      <p className="text-sm" data-testid="finish-cancelled">
        {messages.worker.finishCancelled}
      </p>
    );
  }

  return (
    <section className="space-y-4 rounded-xl border border-amber-300 bg-amber-50 p-5">
      <ResultDetails result={result} />
      <p className="text-lg font-semibold">{messages.worker.finishQuestion}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <form action={formAction} onSubmit={setFreshIdempotencyKey}>
          <input name="operation" type="hidden" value="finish" />
          <input name="productId" type="hidden" value={result.productId} />
          <input name="expectedVersion" type="hidden" value={result.version} />
          <input
            defaultValue={initialIdempotencyKey}
            name="idempotencyKey"
            type="hidden"
          />
          <button
            className="min-h-14 w-full rounded-xl bg-primary px-5 py-3 text-base font-semibold text-primary-foreground"
            data-testid="finish-confirm"
            disabled={isSubmitting}
            type="submit"
          >
            {messages.worker.finishWork}
          </button>
        </form>
        <button
          className="min-h-14 rounded-xl border bg-white px-5 py-3 text-base font-semibold"
          data-testid="finish-cancel"
          onClick={() => setCancelled(true)}
          type="button"
        >
          {messages.worker.finishNo}
        </button>
      </div>
    </section>
  );
}

function CompletedReturnConfirmation({
  result,
  formAction,
  isSubmitting,
}: {
  result: WorkerScanResult;
  formAction: WorkerScanFormAction;
  isSubmitting: boolean;
}) {
  const [cancelled, setCancelled] = useState(false);
  const [initialIdempotencyKey] = useState(() => crypto.randomUUID());

  if (cancelled) {
    return (
      <p className="text-sm" data-testid="return-cancelled">
        {messages.worker.returnCancelled}
      </p>
    );
  }

  return (
    <section className="space-y-4 rounded-xl border border-amber-300 bg-amber-50 p-5">
      <ResultDetails result={result} />
      <p className="text-lg font-semibold">{messages.worker.returnQuestion}</p>
      <form action={formAction} onSubmit={setFreshIdempotencyKey}>
        <input name="operation" type="hidden" value="return_to_process" />
        <input name="productId" type="hidden" value={result.productId} />
        <input name="expectedVersion" type="hidden" value={result.version} />
        <input
          defaultValue={initialIdempotencyKey}
          name="idempotencyKey"
          type="hidden"
        />
        <button
          className="min-h-14 w-full rounded-xl bg-primary px-5 py-3 text-base font-semibold text-primary-foreground"
          data-testid="return-to-process"
          disabled={isSubmitting}
          type="submit"
        >
          {messages.worker.returnToProcess}
        </button>
      </form>
      <button
        className="min-h-14 w-full rounded-xl border bg-white px-5 py-3 text-base font-semibold"
        data-testid="return-cancel"
        onClick={() => setCancelled(true)}
        type="button"
      >
        {messages.worker.finishNo}
      </button>
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

          {state.result?.scanOutcome === "WORKFLOW_STAGE_SELECTION_REQUIRED" &&
          state.result.workflow?.selectionAction ? (
            <WorkflowStageSelection
              action={state.result.workflow.selectionAction}
              barcode={state.result.barcode}
              candidates={state.result.workflow.selectionCandidates}
              expectedVersion={state.result.version}
              formAction={formAction}
              isSubmitting={isSubmitting}
              productId={state.result.productId}
            />
          ) : state.workflowSelection && state.result ? (
            <WorkflowStageSelection
              action="RETURN_TO_PROCESS"
              barcode={state.result.barcode}
              candidates={state.workflowSelection.selection.candidates}
              expectedVersion={state.result.version}
              formAction={formAction}
              isSubmitting={isSubmitting}
              productId={state.result.productId}
            />
          ) : state.result ? (
            state.result.scanOutcome === "TAKEOVER_CONFIRMATION_REQUIRED" ? (
              <TakeoverForm
                barcode={state.result.barcode}
                formAction={formAction}
                isSubmitting={isSubmitting}
                result={state.result}
              />
            ) : state.result.scanOutcome === "FINISH_CONFIRMATION_REQUIRED" ? (
              <FinishConfirmation
                formAction={formAction}
                isSubmitting={isSubmitting}
                result={state.result}
              />
            ) : state.result.status === "COMPLETED" &&
              data.canReturnToProcess &&
              (state.result.scanOutcome === "COMPLETED_SAME_DEPARTMENT" ||
                state.result.scanOutcome === "COMPLETED_OTHER_DEPARTMENT" ||
                state.result.scanOutcome === "COMPLETED_CONTEXT_UNKNOWN") ? (
              <CompletedReturnConfirmation
                formAction={formAction}
                isSubmitting={isSubmitting}
                result={state.result}
              />
            ) : (
              <ResultDetails result={state.result} />
            )
          ) : null}

          {state.lifecycleResult ? (
            <LifecycleResultDetails result={state.lifecycleResult} />
          ) : null}
        </section>
      </section>
    </main>
  );
}
