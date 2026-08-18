"use client";

import {
  useActionState,
  useRef,
  type ChangeEvent,
  type FormEvent,
  type MouseEvent,
} from "react";

import { defaultLocale, getMessages } from "@/lib/i18n";

import { createProductAction } from "./actions";
import { normalizeProductTargetAt } from "./product-date";
import { initialProductCreationActionState } from "./product-action-types";

type ProductOption = { id: string; label: string };

type ProductCreationFormProps = {
  initialIdempotencyKey: string;
  orders: readonly ProductOption[];
  productTypes: readonly ProductOption[];
  workflows: readonly ProductOption[];
};

const messages = getMessages(defaultLocale);

export function ProductCreationForm({
  initialIdempotencyKey,
  orders,
  productTypes,
  workflows,
}: ProductCreationFormProps) {
  const idempotencyKey = useRef(initialIdempotencyKey);
  const targetAtUtcInput = useRef<HTMLInputElement>(null);
  const [state, formAction, isSubmitting] = useActionState(
    createProductAction,
    initialProductCreationActionState,
  );

  function ensureIdempotencyKey(form: HTMLFormElement) {
    if (!idempotencyKey.current) {
      idempotencyKey.current = globalThis.crypto.randomUUID();
    }

    const hiddenInput = form.elements.namedItem("idempotencyKey");
    if (hiddenInput instanceof HTMLInputElement) {
      hiddenInput.value = idempotencyKey.current;
    }

    const localTargetInput = form.elements.namedItem("targetAtLocal");
    const utcTargetInput = form.elements.namedItem("targetAt");
    if (
      localTargetInput instanceof HTMLInputElement &&
      utcTargetInput instanceof HTMLInputElement
    ) {
      if (!localTargetInput.value) {
        utcTargetInput.value = "";
        return;
      }

      try {
        utcTargetInput.value = normalizeProductTargetAt(localTargetInput.value);
      } catch {
        utcTargetInput.value = "";
      }
    }
  }

  function prepareSubmission(event: FormEvent<HTMLFormElement>) {
    ensureIdempotencyKey(event.currentTarget);
  }

  function prepareClick(event: MouseEvent<HTMLButtonElement>) {
    if (event.currentTarget.form) {
      ensureIdempotencyKey(event.currentTarget.form);
    }
  }

  function prepareTargetAt(event: ChangeEvent<HTMLInputElement>) {
    const utcInput = targetAtUtcInput.current;
    if (!utcInput) {
      return;
    }

    if (!event.currentTarget.value) {
      utcInput.value = "";
      return;
    }

    try {
      utcInput.value = normalizeProductTargetAt(event.currentTarget.value);
    } catch {
      utcInput.value = "";
    }
  }

  if (state.product) {
    return (
      <section
        aria-live="polite"
        className="space-y-5 rounded-xl border border-emerald-300 bg-emerald-50 p-6"
        data-testid="product-created"
      >
        <h2 className="text-2xl font-semibold">{messages.products.created}</h2>
        <dl className="grid gap-4 text-sm sm:grid-cols-3">
          <div>
            <dt className="font-medium text-muted-foreground">
              {messages.products.serialNumber}
            </dt>
            <dd
              className="mt-1 font-mono text-base"
              data-testid="created-serial"
            >
              {state.product.serialNumber}
            </dd>
          </div>
          <div>
            <dt className="font-medium text-muted-foreground">
              {messages.products.status}
            </dt>
            <dd
              className="mt-1 font-mono text-base"
              data-testid="created-status"
            >
              {state.product.status}
            </dd>
          </div>
          <div>
            <dt className="font-medium text-muted-foreground">
              {messages.products.barcode}
            </dt>
            <dd
              className="mt-1 break-all font-mono text-base"
              data-testid="created-barcode"
            >
              {state.product.barcode}
            </dd>
          </div>
        </dl>
      </section>
    );
  }

  const errorMessage =
    state.errorCode === "UNAUTHORIZED"
      ? messages.products.unauthorized
      : state.errorCode
        ? messages.products.creationFailed
        : null;

  return (
    <form
      action={formAction}
      className="space-y-6 rounded-xl border bg-white p-6 shadow-sm"
      id="product-creation-form"
      onSubmit={prepareSubmission}
    >
      <input
        defaultValue={initialIdempotencyKey}
        name="idempotencyKey"
        type="hidden"
      />
      <input
        id="targetAtUtc"
        name="targetAt"
        ref={targetAtUtcInput}
        type="hidden"
      />

      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="productionOrderId">
          {messages.products.productionOrder}
        </label>
        <select
          className="h-11 w-full rounded-md border bg-background px-3 text-sm"
          defaultValue=""
          id="productionOrderId"
          name="productionOrderId"
        >
          <option value="">{messages.products.optional}</option>
          {orders.map((order) => (
            <option key={order.id} value={order.id}>
              {order.label}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="workflowTemplateId">
          {messages.products.workflow}
        </label>
        <select
          className="h-11 w-full rounded-md border bg-background px-3 text-sm"
          defaultValue=""
          id="workflowTemplateId"
          name="workflowTemplateId"
        >
          <option value="">{messages.products.noWorkflow}</option>
          {workflows.map((workflow) => (
            <option key={workflow.id} value={workflow.id}>
              {workflow.label}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="productTypeId">
          {messages.products.productType}
        </label>
        <select
          className="h-11 w-full rounded-md border bg-background px-3 text-sm"
          defaultValue=""
          id="productTypeId"
          name="productTypeId"
        >
          <option value="">{messages.products.optional}</option>
          {productTypes.map((productType) => (
            <option key={productType.id} value={productType.id}>
              {productType.label}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="targetAt">
          {messages.products.targetDate}
        </label>
        <input
          className="h-11 w-full rounded-md border bg-background px-3 text-sm"
          id="targetAt"
          name="targetAtLocal"
          onChange={prepareTargetAt}
          type="datetime-local"
        />
      </div>

      <label className="flex min-h-11 items-center gap-3 text-sm font-medium">
        <input className="size-5" name="isUrgent" type="checkbox" />
        {messages.products.urgent}
      </label>

      {errorMessage ? (
        <p aria-live="polite" className="text-destructive text-sm" role="alert">
          {errorMessage}
        </p>
      ) : null}

      <button
        className="inline-flex h-12 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
        disabled={isSubmitting}
        id="create-product-submit"
        onClick={prepareClick}
        type="submit"
      >
        {isSubmitting ? messages.products.creating : messages.products.create}
      </button>
    </form>
  );
}
