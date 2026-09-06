"use client";
import { useMessages } from "@/lib/i18n/client";

import { useActionState, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { FormAction } from "@/shared/actions/action-state";

export function ActionForm({
  action,
  children,
  submit,
  testId,
}: {
  action: FormAction;
  children?: ReactNode;
  submit: string;
  testId?: string;
}) {
  const router = useRouter();
  const key = useRef<string | null>(null);
  const m = useMessages().operations;
  const [state, dispatch, pending] = useActionState(
    async (previous: Parameters<FormAction>[0], form: FormData) => {
      key.current ??= crypto.randomUUID();
      form.set("idempotencyKey", key.current);
      const result = await action(previous, form);
      if (result.success) {
        key.current = null;
        router.refresh();
      }
      return result;
    },
    { errorCode: null, success: false },
  );
  return (
    <form
      action={dispatch}
      data-testid={testId}
      className="space-y-3"
      onChange={() => {
        key.current = null;
      }}
    >
      <fieldset disabled={pending} className="space-y-3">
        {children}
        <button
          className="rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
          type="submit"
        >
          {pending ? m.saving : submit}
        </button>
      </fieldset>
      {state.errorCode ? (
        <p role="alert" className="text-sm text-red-700">
          {m.errors[state.errorCode as keyof typeof m.errors] ?? m.failed}
        </p>
      ) : state.success ? (
        <p role="status" className="text-sm text-emerald-700">
          {m.saved}
        </p>
      ) : null}
    </form>
  );
}
