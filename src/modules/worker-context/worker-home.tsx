"use client";
import { useMessages } from "@/lib/i18n/client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import type { FormEvent } from "react";

import { defaultLocale, getMessages } from "@/lib/i18n";
import { finishProductAction } from "@/modules/products/lifecycle-actions";
import {
  initialProductLifecycleActionState,
  type ProductLifecycleActionState,
} from "@/modules/products/lifecycle-action-types";

import { selectActiveProductionRoleAction } from "./actions";
import {
  initialWorkerRoleSelectionActionState,
  type WorkerRoleSelectionActionState,
} from "./worker-action-types";
import type { WorkerHomeData, WorkerProductDto } from "./worker-context.types";

import {
  QrCode,
  UserCheck,
  Building2,
  Calendar,
  Layers,
  MapPin,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Tag,
  ArrowRight,
} from "lucide-react";

function formatTargetAt(
  messages: ReturnType<typeof getMessages>,
  targetAt: string | null,
): string {
  return targetAt
    ? new Date(targetAt).toLocaleString(defaultLocale)
    : messages.worker.notSet;
}

function finishProductErrorMessage(
  messages: ReturnType<typeof getMessages>,
  errorCode: ProductLifecycleActionState["errorCode"],
): string | null {
  switch (errorCode) {
    case "RATE_LIMITED":
      return messages.operations.errors.RATE_LIMITED;
    case "PRODUCT_STATE_CHANGED":
      return messages.worker.productStateChanged;
    case "FORBIDDEN":
    case "UNAUTHORIZED":
      return messages.worker.finishUnauthorized;
    case "PRODUCT_NOT_FINISHABLE":
    case "ACTIVE_ASSIGNMENT_REQUIRED":
    case "ACTIVE_ASSIGNMENT_CONFLICT":
    case "INVALID_LIFECYCLE_INPUT":
    case "IDEMPOTENCY_CONFLICT":
    case "LIFECYCLE_FAILED":
      return messages.worker.finishFailed;
    default:
      return null;
  }
}

function FinishProductForm({ product }: { product: WorkerProductDto }) {
  const messages = useMessages();
  const router = useRouter();
  const [initialIdempotencyKey] = useState(() => crypto.randomUUID());
  const [state, formAction, isSubmitting] = useActionState(
    finishProductAction,
    initialProductLifecycleActionState,
  );
  const errorMessage = finishProductErrorMessage(messages, state.errorCode);

  useEffect(() => {
    if (state.result) {
      router.refresh();
    }
  }, [router, state.result]);

  function setFreshKey(event: FormEvent<HTMLFormElement>) {
    const input = event.currentTarget.elements.namedItem("idempotencyKey");
    if (input instanceof HTMLInputElement) {
      input.value = crypto.randomUUID();
    }
  }

  return (
    <div className="mt-4 space-y-3 border-t pt-4">
      {errorMessage ? (
        <p className="text-destructive text-xs font-semibold" role="alert">
          {errorMessage}
        </p>
      ) : null}
      {state.result ? (
        <div
          aria-live="polite"
          className="flex items-center gap-2 rounded-lg bg-emerald-50 p-3 text-sm font-semibold text-emerald-800"
          data-testid="work-finished"
        >
          <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          <span>{messages.worker.workFinished}</span>
        </div>
      ) : (
        <form action={formAction} onSubmit={setFreshKey}>
          <input name="operation" type="hidden" value="products.finish" />
          <input name="productId" type="hidden" value={product.id} />
          <input name="expectedVersion" type="hidden" value={product.version} />
          <input
            defaultValue={initialIdempotencyKey}
            name="idempotencyKey"
            type="hidden"
          />
          <button
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-base font-bold text-white shadow-md transition-all hover:bg-blue-700 active:scale-[0.99] disabled:opacity-50"
            data-testid="finish-product"
            disabled={isSubmitting}
            type="submit"
          >
            <CheckCircle2 className="h-5 w-5" />
            <span>
              {isSubmitting
                ? messages.worker.finishSubmitting
                : messages.worker.finishWork}
            </span>
          </button>
        </form>
      )}
    </div>
  );
}

function roleSelectionError(
  messages: ReturnType<typeof getMessages>,
  errorCode: WorkerRoleSelectionActionState["errorCode"],
): string | null {
  if (!errorCode) {
    return null;
  }

  if (errorCode === "FORBIDDEN") {
    return messages.worker.roleSelectionForbidden;
  }

  if (errorCode === "UNAUTHORIZED") {
    return messages.worker.roleSelectionUnauthorized;
  }

  return messages.worker.roleSelectionFailed;
}

function WorkerProductCard({ product }: { product: WorkerProductDto }) {
  const messages = useMessages();
  return (
    <article
      className="priority-card space-y-4 bg-white"
      data-testid="worker-product-card"
    >
      <div className="flex items-start justify-between gap-4 border-b pb-3">
        <div>
          <div className="flex items-center gap-2">
            <Tag className="h-4 w-4 text-blue-600" />
            <h3
              className="text-xl font-bold tracking-tight text-slate-900"
              data-testid="worker-product-serial"
            >
              {product.serialNumber}
            </h3>
          </div>
          <p className="mt-1 text-xs font-semibold text-amber-700">
            {messages.worker.status}:{" "}
            <span className="priority-badge-in-progress">
              {messages.worker.inProgress}
            </span>
          </p>
        </div>
        {product.isUrgent ? (
          <span className="priority-badge-urgent">
            <AlertTriangle className="h-3.5 w-3.5" />
            <span>{messages.worker.urgent}</span>
          </span>
        ) : null}
      </div>

      <dl className="grid gap-3 text-xs sm:grid-cols-2">
        <div className="rounded-lg bg-slate-50 p-2.5">
          <dt className="flex items-center gap-1 font-semibold text-slate-500">
            <Clock className="h-3.5 w-3.5" />
            <span>{messages.worker.targetDate}</span>
          </dt>
          <dd className="mt-1 font-medium text-slate-900">
            {formatTargetAt(messages, product.targetAt)}
          </dd>
        </div>
        <div className="rounded-lg bg-slate-50 p-2.5">
          <dt className="flex items-center gap-1 font-semibold text-slate-500">
            <Tag className="h-3.5 w-3.5" />
            <span>{messages.worker.productionOrder}</span>
          </dt>
          <dd className="mt-1 font-medium text-slate-900">
            {product.productionOrder?.orderNumber ?? messages.worker.notSet}
          </dd>
        </div>
        <div className="rounded-lg bg-slate-50 p-2.5">
          <dt className="flex items-center gap-1 font-semibold text-slate-500">
            <Layers className="h-3.5 w-3.5" />
            <span>{messages.worker.productType}</span>
          </dt>
          <dd className="mt-1 font-medium text-slate-900">
            {product.productType?.name ?? messages.worker.notSet}
          </dd>
        </div>
        <div className="rounded-lg bg-slate-50 p-2.5">
          <dt className="flex items-center gap-1 font-semibold text-slate-500">
            <UserCheck className="h-3.5 w-3.5" />
            <span>{messages.worker.currentProductionRole}</span>
          </dt>
          <dd className="mt-1 font-medium text-slate-900">
            {product.currentRole?.name ?? messages.worker.notSet}
          </dd>
        </div>
        <div className="rounded-lg bg-slate-50 p-2.5">
          <dt className="flex items-center gap-1 font-semibold text-slate-500">
            <MapPin className="h-3.5 w-3.5" />
            <span>{messages.worker.currentLocation}</span>
          </dt>
          <dd className="mt-1 font-medium text-slate-900">
            {product.currentLocation?.name ?? messages.worker.notSet}
          </dd>
        </div>
        {product.workflow ? (
          <>
            <div className="rounded-lg bg-blue-50/60 p-2.5">
              <dt className="font-semibold text-blue-700">
                {messages.worker.currentWorkflowStage}
              </dt>
              <dd
                className="mt-1 font-bold text-blue-900"
                data-testid="worker-current-stage"
              >
                {product.workflow.currentStage?.name ?? messages.worker.notSet}
              </dd>
            </div>
            <div className="rounded-lg bg-indigo-50/60 p-2.5">
              <dt className="font-semibold text-indigo-700">
                {messages.worker.expectedWorkflowStage}
              </dt>
              <dd
                className="mt-1 font-bold text-indigo-900"
                data-testid="worker-expected-stage"
              >
                {product.workflow.expectedNextStage?.name ??
                  messages.worker.notSet}
              </dd>
            </div>
            {product.workflow.deviation ? (
              <div
                className="rounded-lg bg-rose-50 p-2.5"
                data-testid="worker-workflow-deviation"
              >
                <dt className="font-semibold text-rose-700">
                  {messages.worker.workflowDeviation}
                </dt>
                <dd className="mt-1 font-bold text-rose-900">
                  {messages.worker.yes}
                </dd>
              </div>
            ) : null}
          </>
        ) : null}
      </dl>

      <FinishProductForm product={product} />
    </article>
  );
}

function RoleSelection({ data }: { data: WorkerHomeData }) {
  const messages = useMessages();
  const [state, formAction, isSubmitting] = useActionState(
    selectActiveProductionRoleAction,
    {
      ...initialWorkerRoleSelectionActionState,
      activeProductionRoleId:
        data.productionRoleState.activeProductionRole?.id ?? null,
    },
  );
  const errorMessage = roleSelectionError(messages, state.errorCode);
  const activeRoleId =
    state.activeProductionRoleId ??
    data.productionRoleState.activeProductionRole?.id ??
    null;
  const activeRole = data.productionRoleState.availableRoles.find(
    (role) => role.id === activeRoleId,
  );
  const roleSelectionRequired = activeRole === undefined || activeRole === null;
  const shouldShowSelection =
    data.productionRoleState.availableRoles.length > 1;

  if (!shouldShowSelection) {
    return null;
  }

  return (
    <div className="space-y-4">
      {activeRole ? (
        <p
          className="text-base font-bold text-blue-600"
          data-testid="active-production-role"
        >
          {activeRole.name}
        </p>
      ) : null}
      <div>
        <h2
          className="text-lg font-bold text-slate-900"
          data-testid="worker-role-selection-heading"
        >
          {roleSelectionRequired
            ? messages.worker.chooseProductionRole
            : messages.worker.changeProductionRole}
        </h2>
        {roleSelectionRequired ? (
          <p
            className="mt-1 text-xs font-semibold text-amber-700"
            data-testid="role-selection-required"
          >
            {messages.worker.roleSelectionRequired}
          </p>
        ) : null}
      </div>

      {errorMessage ? (
        <p
          aria-live="polite"
          className="text-destructive text-xs font-semibold"
          role="alert"
        >
          {errorMessage}
        </p>
      ) : null}

      <form action={formAction} className="grid gap-3 sm:grid-cols-2">
        {data.productionRoleState.availableRoles.map((role) => (
          <button
            aria-pressed={activeRoleId === role.id}
            className={`min-h-14 rounded-xl border px-4 py-3 text-start text-xs font-bold shadow-xs transition-all ${
              activeRoleId === role.id
                ? "border-blue-600 bg-blue-600 text-white shadow-md"
                : "border-slate-200 bg-white text-slate-800 hover:bg-slate-50"
            }`}
            disabled={isSubmitting}
            key={role.id}
            name="productionRoleId"
            type="submit"
            value={role.id}
          >
            <span className="block text-sm">{role.name}</span>
            <span className="mt-0.5 block text-[11px] font-normal opacity-80">
              {role.code}
            </span>
          </button>
        ))}
      </form>
    </div>
  );
}

export function WorkerHome({ data }: { data: WorkerHomeData }) {
  const messages = useMessages();
  const roleState = data.productionRoleState;

  return (
    <main className="min-h-screen px-4 py-6 sm:px-6 sm:py-10">
      <section
        className="mx-auto w-full max-w-4xl space-y-6"
        data-testid="worker-home"
      >
        {/* Header Profile Banner */}
        <header className="space-y-3 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
              <QrCode className="h-3.5 w-3.5" />
              <span>{messages.worker.myWork}</span>
            </span>
            <span className="text-xs font-semibold text-slate-400">
              Priority Floor Workstation
            </span>
          </div>

          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            {messages.worker.title}
          </h1>

          <dl className="grid gap-3 rounded-xl border border-slate-100 bg-slate-50 p-4 text-xs font-medium sm:grid-cols-2">
            <div className="flex items-center gap-2">
              <UserCheck className="h-4 w-4 text-blue-600" />
              <div>
                <dt className="text-slate-500">{messages.worker.employee}</dt>
                <dd
                  className="font-bold text-slate-900"
                  data-testid="worker-display-name"
                >
                  {data.employee.displayName}
                </dd>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-blue-600" />
              <div>
                <dt className="text-slate-500">
                  {messages.worker.organization}
                </dt>
                <dd
                  className="font-bold text-slate-900"
                  data-testid="worker-organization"
                >
                  {data.employee.organizationName}
                </dd>
              </div>
            </div>
          </dl>
        </header>

        {/* Active Role & Scanner Card */}
        <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              {messages.worker.activeProductionRole}
            </h2>
            {roleState.activeProductionRole &&
            roleState.availableRoles.length === 1 ? (
              <p
                className="mt-1 text-base font-semibold text-blue-600"
                data-testid="active-production-role"
              >
                {roleState.activeProductionRole.name}
              </p>
            ) : null}
          </div>

          {roleState.kind === "NO_PRODUCTION_ROLES" ? (
            <p
              className="text-xs font-semibold text-rose-600"
              data-testid="no-production-role"
            >
              {messages.worker.noProductionRoleAssigned}
            </p>
          ) : (
            <RoleSelection data={data} />
          )}

          <div className="pt-2">
            <Link
              className="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 py-3.5 text-base font-bold text-white shadow-md transition-all hover:bg-emerald-700 active:scale-[0.99] sm:w-auto"
              data-testid="worker-scan-link"
              href="/app/worker/scan"
            >
              <QrCode className="h-5 w-5" />
              <span>{messages.worker.scanProduct}</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>

        {/* Assigned Products Section */}
        <section className="space-y-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900">
              {messages.worker.myProducts}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {messages.worker.myProductsDescription}
            </p>
          </div>

          {data.products.length === 0 ? (
            <div
              className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center"
              data-testid="no-worker-products"
            >
              <CheckCircle2 className="mx-auto h-8 w-8 text-slate-400" />
              <p className="mt-2 text-xs font-medium text-slate-600">
                {messages.worker.noProductsCurrentlyAssigned}
              </p>
            </div>
          ) : (
            <div className="grid gap-4" data-testid="worker-products">
              {data.products.map((product) => (
                <WorkerProductCard key={product.id} product={product} />
              ))}
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
