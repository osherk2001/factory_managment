"use client";

import { useActionState } from "react";

import { defaultLocale, getMessages } from "@/lib/i18n";

import { selectActiveProductionRoleAction } from "./actions";
import {
  initialWorkerRoleSelectionActionState,
  type WorkerRoleSelectionActionState,
} from "./worker-action-types";
import type { WorkerHomeData, WorkerProductDto } from "./worker-context.types";

const messages = getMessages(defaultLocale);

function formatTargetAt(targetAt: string | null): string {
  return targetAt
    ? new Date(targetAt).toLocaleString(defaultLocale)
    : messages.worker.notSet;
}

function roleSelectionError(
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
  return (
    <article
      className="space-y-4 rounded-xl border bg-white p-5 shadow-sm"
      data-testid="worker-product-card"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3
            className="text-lg font-semibold"
            data-testid="worker-product-serial"
          >
            {product.serialNumber}
          </h3>
          <p className="text-sm text-muted-foreground">
            {messages.worker.status}: {messages.worker.inProgress}
          </p>
        </div>
        {product.isUrgent ? (
          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900">
            {messages.worker.urgent}
          </span>
        ) : null}
      </div>

      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="font-medium text-muted-foreground">
            {messages.worker.targetDate}
          </dt>
          <dd>{formatTargetAt(product.targetAt)}</dd>
        </div>
        <div>
          <dt className="font-medium text-muted-foreground">
            {messages.worker.productionOrder}
          </dt>
          <dd>
            {product.productionOrder?.orderNumber ?? messages.worker.notSet}
          </dd>
        </div>
        <div>
          <dt className="font-medium text-muted-foreground">
            {messages.worker.productType}
          </dt>
          <dd>{product.productType?.name ?? messages.worker.notSet}</dd>
        </div>
        <div>
          <dt className="font-medium text-muted-foreground">
            {messages.worker.currentProductionRole}
          </dt>
          <dd>{product.currentRole?.name ?? messages.worker.notSet}</dd>
        </div>
        <div>
          <dt className="font-medium text-muted-foreground">
            {messages.worker.currentLocation}
          </dt>
          <dd>{product.currentLocation?.name ?? messages.worker.notSet}</dd>
        </div>
      </dl>
    </article>
  );
}

function RoleSelection({ data }: { data: WorkerHomeData }) {
  const [state, formAction, isSubmitting] = useActionState(
    selectActiveProductionRoleAction,
    {
      ...initialWorkerRoleSelectionActionState,
      activeProductionRoleId:
        data.productionRoleState.activeProductionRole?.id ?? null,
    },
  );
  const errorMessage = roleSelectionError(state.errorCode);
  const activeRoleId =
    state.activeProductionRoleId ??
    data.productionRoleState.activeProductionRole?.id ??
    null;
  const activeRole = data.productionRoleState.availableRoles.find(
    (role) => role.id === activeRoleId,
  );
  const shouldShowSelection =
    data.productionRoleState.availableRoles.length > 1;

  if (!shouldShowSelection) {
    return null;
  }

  return (
    <div className="space-y-4">
      {activeRole ? (
        <p className="text-lg" data-testid="active-production-role">
          {activeRole.name}
        </p>
      ) : null}
      <div>
        <h2 className="text-xl font-semibold">
          {data.productionRoleState.kind === "ACTIVE_PRODUCTION_ROLE_REQUIRED"
            ? messages.worker.chooseProductionRole
            : messages.worker.changeProductionRole}
        </h2>
        {data.productionRoleState.kind === "ACTIVE_PRODUCTION_ROLE_REQUIRED" ? (
          <p
            className="mt-1 text-sm text-muted-foreground"
            data-testid="role-selection-required"
          >
            {messages.worker.roleSelectionRequired}
          </p>
        ) : null}
      </div>

      {errorMessage ? (
        <p aria-live="polite" className="text-destructive text-sm" role="alert">
          {errorMessage}
        </p>
      ) : null}

      <form action={formAction} className="grid gap-3 sm:grid-cols-2">
        {data.productionRoleState.availableRoles.map((role) => (
          <button
            aria-pressed={activeRoleId === role.id}
            className={`min-h-16 rounded-xl border px-4 py-3 text-start text-base font-semibold transition-colors ${
              activeRoleId === role.id
                ? "border-primary bg-primary text-primary-foreground"
                : "bg-white hover:bg-muted"
            }`}
            disabled={isSubmitting}
            key={role.id}
            name="productionRoleId"
            type="submit"
            value={role.id}
          >
            <span className="block">{role.name}</span>
            <span className="mt-1 block text-xs font-normal opacity-80">
              {role.code}
            </span>
          </button>
        ))}
      </form>
    </div>
  );
}

export function WorkerHome({ data }: { data: WorkerHomeData }) {
  const roleState = data.productionRoleState;

  return (
    <main className="min-h-screen px-4 py-8 sm:px-6 sm:py-12">
      <section
        className="mx-auto w-full max-w-3xl space-y-8"
        data-testid="worker-home"
      >
        <header className="space-y-3">
          <p className="text-sm font-medium text-muted-foreground">
            {messages.worker.myWork}
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">
            {messages.worker.title}
          </h1>
          <dl className="grid gap-3 rounded-xl border bg-white p-5 text-sm shadow-sm sm:grid-cols-2">
            <div>
              <dt className="font-medium text-muted-foreground">
                {messages.worker.employee}
              </dt>
              <dd data-testid="worker-display-name">
                {data.employee.displayName}
              </dd>
            </div>
            <div>
              <dt className="font-medium text-muted-foreground">
                {messages.worker.organization}
              </dt>
              <dd data-testid="worker-organization">
                {data.employee.organizationName}
              </dd>
            </div>
          </dl>
        </header>

        <section className="space-y-4 rounded-xl border bg-white p-5 shadow-sm">
          <div>
            <h2 className="text-xl font-semibold">
              {messages.worker.activeProductionRole}
            </h2>
            {roleState.activeProductionRole &&
            roleState.availableRoles.length === 1 ? (
              <p className="mt-2 text-lg" data-testid="active-production-role">
                {roleState.activeProductionRole.name}
              </p>
            ) : null}
          </div>

          {roleState.kind === "NO_PRODUCTION_ROLES" ? (
            <p data-testid="no-production-role">
              {messages.worker.noProductionRoleAssigned}
            </p>
          ) : (
            <RoleSelection data={data} />
          )}
        </section>

        <section className="space-y-4">
          <div>
            <h2 className="text-2xl font-semibold">
              {messages.worker.myProducts}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {messages.worker.myProductsDescription}
            </p>
          </div>

          {data.products.length === 0 ? (
            <p
              className="rounded-xl border border-dashed bg-white p-6 text-sm"
              data-testid="no-worker-products"
            >
              {messages.worker.noProductsCurrentlyAssigned}
            </p>
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
