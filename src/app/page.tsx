import Link from "next/link";
import { getRequestMessages } from "@/lib/i18n/server";
import { LanguagePicker } from "@/components/language-picker";
export default async function HomePage() {
  const m = await getRequestMessages();
  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-16">
      <section className="w-full max-w-2xl space-y-8 rounded-xl border bg-white p-8 shadow-sm">
        <div className="flex justify-between gap-4">
          <p className="font-semibold">{m.app.title}</p>
          <LanguagePicker />
        </div>
        <h1 className="text-4xl font-semibold tracking-tight">
          {m.operations.dashboard}
        </h1>
        <p className="text-lg text-muted-foreground">
          {m.operations.products} · {m.products.currentWorker} ·{" "}
          {m.products.currentLocation} · {m.operations.history}
        </p>
        <Link
          href="/login"
          className="inline-block rounded bg-primary px-6 py-3 font-medium text-primary-foreground"
        >
          {m.auth.title}
        </Link>
      </section>
    </main>
  );
}
