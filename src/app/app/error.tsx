"use client";
import { useMessages } from "@/lib/i18n/client";
export default function AppError({ reset }: { reset: () => void }) {
  const m = useMessages().operations;
  return (
    <main className="mx-auto max-w-xl space-y-4 p-8">
      <h1 className="text-xl font-semibold">{m.failed}</h1>
      <button className="rounded border px-4 py-3" onClick={reset}>
        {m.filter}
      </button>
    </main>
  );
}
