import { getRequestMessages } from "@/lib/i18n/server";
import Link from "next/link";
import { getOperationalDashboard } from "@/modules/reports/operations.service";
export default async function DashboardPage() {
  const data = await getOperationalDashboard();
  const m = await getRequestMessages();
  const o = m.operations;
  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <h1 className="text-3xl font-semibold">{o.dashboard}</h1>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        {data.counts.map((c) => (
          <Link
            key={c.status}
            href={`/app/products?status=${c.status}`}
            className="space-y-3 rounded-xl border bg-white p-5"
          >
            <p className="text-sm text-muted-foreground">
              {m.products.statusValues[c.status]}
            </p>
            <p className="text-4xl font-semibold">{c.count}</p>
          </Link>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          [o.urgent, data.urgent, "urgent"],
          [o.delayed, data.delayed, "delayed"],
          ...(data.issues === null
            ? []
            : [[o.openIssues, data.issues, "issues"]]),
        ].map(([label, count, filter]) => (
          <Link
            key={String(filter)}
            href={`/app/products?${filter}=true`}
            className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-5"
          >
            <p className="text-sm">{label}</p>
            <p className="text-3xl font-semibold">{count}</p>
          </Link>
        ))}
      </div>
      <Link
        className="inline-block rounded bg-primary px-4 py-3 text-primary-foreground"
        href="/app/products"
      >
        {o.products}
      </Link>
    </main>
  );
}
