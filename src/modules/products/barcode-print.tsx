"use client";
import { useMessages } from "@/lib/i18n/client";

import Image from "next/image";
import { useActionState, useRef } from "react";
import { preparePrintAction } from "./print-actions";
export function BarcodePrint({ productId, reprint }: { productId: string; reprint: boolean }) {
  const m = useMessages().operations;
  const key = useRef<HTMLInputElement>(null);
  const [state, action, pending] = useActionState(preparePrintAction, { errorCode: null, label: null });
  return <section className="space-y-5 rounded-xl border bg-white p-6">
    <p className="text-sm text-muted-foreground">{m.printHint}</p>
    {!state.label ? <form action={action} onSubmit={() => { if (key.current && !key.current.value) key.current.value = crypto.randomUUID(); }}>
      <input type="hidden" name="productId" value={productId}/><input type="hidden" name="reprint" value={String(reprint)}/><input ref={key} type="hidden" name="idempotencyKey"/>
      <button disabled={pending} className="rounded bg-primary px-4 py-3 text-primary-foreground">{pending ? m.saving : reprint ? m.reprint : m.print}</button>
    </form> : <><div id="barcode-label" className="mx-auto w-fit bg-white p-4 text-center text-black"><Image unoptimized src={state.label.image} width={320} height={320} alt={state.label.serial}/><p dir="ltr" className="font-semibold">{state.label.serial}</p></div><button className="rounded bg-primary px-4 py-3 text-primary-foreground" onClick={() => window.print()}>{m.printReady}</button></>}
    {state.errorCode ? <p role="alert">{m.errors[state.errorCode as keyof typeof m.errors] ?? m.failed}</p> : null}
  </section>;
}

