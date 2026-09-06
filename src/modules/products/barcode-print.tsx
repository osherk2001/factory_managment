"use client";
import { useMessages } from "@/lib/i18n/client";

import Image from "next/image";
import { useActionState, useRef } from "react";
import { preparePrintAction } from "./print-actions";
export function BarcodePrint({
  productId,
  reprint,
}: {
  productId: string;
  reprint: boolean;
}) {
  const m = useMessages().operations;
  const key = useRef<string | null>(null);
  const [state, action, pending] = useActionState(
    async (
      previous: Parameters<typeof preparePrintAction>[0],
      form: FormData,
    ) => {
      key.current ??= crypto.randomUUID();
      form.set("idempotencyKey", key.current);
      return preparePrintAction(previous, form);
    },
    { errorCode: null, label: null },
  );
  return (
    <section className="space-y-5 rounded-xl border bg-white p-6">
      <p className="text-sm text-muted-foreground">{m.printHint}</p>
      {!state.label ? (
        <form action={action}>
          <input type="hidden" name="productId" value={productId} />
          <input type="hidden" name="reprint" value={String(reprint)} />
          <button
            disabled={pending}
            className="rounded bg-primary px-4 py-3 text-primary-foreground"
          >
            {pending ? m.saving : reprint ? m.reprint : m.print}
          </button>
        </form>
      ) : (
        <>
          <div
            id="barcode-label"
            className="mx-auto w-fit bg-white p-4 text-center text-black"
          >
            <Image
              unoptimized
              src={state.label.image}
              width={320}
              height={320}
              alt={state.label.serial}
            />
            <p dir="ltr" className="font-semibold">
              {state.label.serial}
            </p>
          </div>
          <button
            className="rounded bg-primary px-4 py-3 text-primary-foreground"
            onClick={() => window.print()}
          >
            {m.printReady}
          </button>
        </>
      )}
      {state.errorCode ? (
        <p role="alert">
          {m.errors[state.errorCode as keyof typeof m.errors] ?? m.failed}
        </p>
      ) : null}
    </section>
  );
}
