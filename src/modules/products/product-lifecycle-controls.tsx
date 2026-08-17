"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import type { FormEvent } from "react";

import { defaultLocale, getMessages } from "@/lib/i18n";

import { productLifecycleAction } from "./lifecycle-actions";
import {
  initialProductLifecycleActionState,
  type ProductLifecycleActionState,
} from "./lifecycle-action-types";
import type {
  ProductLifecycleOperation,
  ProductLifecycleResultDto,
} from "./product-lifecycle-types";
import type { ProductLifecyclePageData } from "./product-lifecycle.service";

const messages = getMessages(defaultLocale);

function errorMessage(
  errorCode: ProductLifecycleActionState["errorCode"],
): string | null {
  switch (errorCode) {
    case "FORBIDDEN":
      return messages.products.notAuthorized;
    case "UNAUTHORIZED":
      return messages.products.signInAgain;
    case "PRODUCT_STATE_CHANGED":
      return messages.products.productStateChanged;
    case "PRODUCT_NOT_COMPLETABLE":
    case "PRODUCT_NOT_CANCELLABLE":
    case "PRODUCT_NOT_RESTORABLE":
    case "PRODUCT_NOT_TRASHABLE":
    case "ACTIVE_ASSIGNMENT_REQUIRED":
    case "ACTIVE_ASSIGNMENT_CONFLICT":
    case "INVALID_LIFECYCLE_INPUT":
    case "IDEMPOTENCY_CONFLICT":
    case "LIFECYCLE_FAILED":
      return messages.products.lifecycleFailed;
    default:
      return null;
  }
}

function successMessage(operation: ProductLifecycleOperation | null): string {
  switch (operation) {
    case "products.complete":
      return messages.products.productCompleted;
    case "products.cancel":
      return messages.products.productCancelled;
    case "products.restore":
      return messages.products.productRestored;
    case "products.trash":
      return messages.products.productTrashed;
    default:
      return messages.products.lifecycleSucceeded;
  }
}

function LifecycleActionForm({
  operation,
  product,
  formAction,
  isSubmitting,
  label,
  testId,
}: {
  operation: ProductLifecycleOperation;
  product: ProductLifecycleResultDto;
  formAction: (formData: FormData) => void;
  isSubmitting: boolean;
  label: string;
  testId: string;
}) {
  const [initialIdempotencyKey] = useState(() => crypto.randomUUID());

  function setFreshKey(event: FormEvent<HTMLFormElement>) {
    const input = event.currentTarget.elements.namedItem("idempotencyKey");
    if (input instanceof HTMLInputElement) {
      input.value = crypto.randomUUID();
    }
  }

  return (
    <form action={formAction} onSubmit={setFreshKey}>
      <input name="operation" type="hidden" value={operation} />
      <input name="productId" type="hidden" value={product.productId} />
      <input name="expectedVersion" type="hidden" value={product.version} />
      <input
        defaultValue={initialIdempotencyKey}
        name="idempotencyKey"
        type="hidden"
      />
      <button
        className="min-h-14 w-full rounded-xl bg-primary px-5 py-3 text-base font-semibold text-primary-foreground"
        data-testid={testId}
        disabled={isSubmitting}
        type="submit"
      >
        {label}
      </button>
    </form>
  );
}

export function ProductLifecycleControls({
  data,
}: {
  data: ProductLifecyclePageData;
}) {
  const router = useRouter();
  const [state, formAction, isSubmitting] = useActionState(
    productLifecycleAction,
    initialProductLifecycleActionState,
  );
  const product = data.product;
  const error = errorMessage(state.errorCode);

  useEffect(() => {
    if (state.result) {
      router.refresh();
    }
  }, [router, state.result]);

  return (
    <section className="space-y-4 rounded-xl border bg-white p-5 shadow-sm">
      <h2 className="text-xl font-semibold">{messages.products.actions}</h2>
      {state.result ? (
        <p aria-live="polite" data-testid="lifecycle-success">
          {successMessage(state.operation)}
        </p>
      ) : null}
      {error ? (
        <p
          className="text-destructive text-sm"
          data-testid="lifecycle-error"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        {product.status === "READY_FOR_HANDOFF" && data.canComplete ? (
          <LifecycleActionForm
            formAction={formAction}
            isSubmitting={isSubmitting}
            label={messages.products.completeProduct}
            operation="products.complete"
            product={product}
            testId="complete-product"
          />
        ) : null}
        {(product.status === "CREATED" ||
          product.status === "IN_PROGRESS" ||
          product.status === "READY_FOR_HANDOFF") &&
        data.canCancel ? (
          <LifecycleActionForm
            formAction={formAction}
            isSubmitting={isSubmitting}
            label={messages.products.cancelProduct}
            operation="products.cancel"
            product={product}
            testId="cancel-product"
          />
        ) : null}
        {product.status === "CANCELLED" && data.canRestore ? (
          <LifecycleActionForm
            formAction={formAction}
            isSubmitting={isSubmitting}
            label={messages.products.restoreProduct}
            operation="products.restore"
            product={product}
            testId="restore-product"
          />
        ) : null}
        {product.status === "CANCELLED" && data.canTrash ? (
          <LifecycleActionForm
            formAction={formAction}
            isSubmitting={isSubmitting}
            label={messages.products.moveToTrash}
            operation="products.trash"
            product={product}
            testId="trash-product"
          />
        ) : null}
      </div>
    </section>
  );
}
