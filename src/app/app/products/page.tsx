import { getRequestMessages } from "@/lib/i18n/server";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { listOperationalProducts } from "@/modules/reports/operations.service";
import { cleanSearchParams } from "@/modules/reports/product-filters";
import { isFactoryFlowAuthError } from "@/modules/auth/auth-errors";
import { ApplicationError } from "@/shared/errors";

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = cleanSearchParams(await searchParams);
  const m = await getRequestMessages();
  const o = m.operations;
  let data;
  try {
    data = await listOperationalProducts(query);
  } catch (error) {
    if (isFactoryFlowAuthError(error) && error.code === "UNAUTHENTICATED")
      redirect("/login");
    if (error instanceof ApplicationError && error.code === "INVALID_INPUT")
      return (
        <main className="mx-auto max-w-5xl p-6">
          <p role="alert">{o.errors.INVALID_INPUT}</p>
          <Link href="/app/products">{o.products}</Link>
        </main>
      );
    if (error instanceof ApplicationError) notFound();
    throw error;
  }
  const href = (page: number) =>
    "?" +
    new URLSearchParams({
      ...Object.fromEntries(
        Object.entries(query).filter(
          (entry): entry is [string, string] => typeof entry[1] === "string",
        ),
      ),
      page: String(page),
    }).toString();
  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold">{o.products}</h1>
        {data.canCreate ? (
          <Link
            className="rounded bg-primary px-4 py-2 text-primary-foreground"
            href="/app/products/new"
          >
            {m.products.create}
          </Link>
        ) : null}
      </header>
      <form className="grid gap-3 rounded-xl border bg-white p-5 sm:grid-cols-3">
        <label className="text-sm sm:col-span-2">
          {o.search}
          <input
            name="q"
            defaultValue={data.filters.q}
            maxLength={200}
            className="mt-1 w-full rounded border p-2"
          />
        </label>
        <label className="text-sm">
          {o.status}
          <select
            name="status"
            defaultValue={data.filters.status ?? ""}
            className="mt-1 w-full rounded border p-2"
          >
            <option value="">{o.all}</option>
            {(
              [
                "CREATED",
                "IN_PROGRESS",
                "READY_FOR_HANDOFF",
                "COMPLETED",
                "CANCELLED",
              ] as const
            ).map((s) => (
              <option key={s} value={s}>
                {m.products.statusValues[s]}
              </option>
            ))}
          </select>
        </label>
        {(
          [
            ["workerId", o.worker, data.workers],
            ["roleId", o.role, data.roles],
            ["locationId", o.location, data.locations],
          ] as const
        ).map(([name, label, options]) => (
          <label className="text-sm" key={name}>
            {label}
            <select
              name={name}
              defaultValue={data.filters[name] ?? ""}
              className="mt-1 w-full rounded border p-2"
            >
              <option value="">{o.all}</option>
              {options.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </label>
        ))}
        <div className="flex flex-wrap gap-4 text-sm sm:col-span-3">
          <label>
            <input
              type="checkbox"
              name="urgent"
              value="true"
              defaultChecked={Boolean(data.filters.urgent)}
            />{" "}
            {o.urgent}
          </label>
          <label>
            <input
              type="checkbox"
              name="delayed"
              value="true"
              defaultChecked={Boolean(data.filters.delayed)}
            />{" "}
            {o.delayed}
          </label>
          {data.canReadIssues ? (
            <label>
              <input
                type="checkbox"
                name="issues"
                value="true"
                defaultChecked={Boolean(data.filters.issues)}
              />{" "}
              {o.openIssues}
            </label>
          ) : null}
        </div>
        <button className="rounded border px-4 py-2" type="submit">
          {o.filter}
        </button>
      </form>
      <p className="text-sm text-muted-foreground">
        {o.total}: {data.total}
      </p>
      <div
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
        data-testid="product-results"
      >
        {data.products.map((p) => (
          <Link
            href={`/app/products/${p.id}`}
            key={p.id}
            className="space-y-3 rounded-xl border bg-white p-5 shadow-sm transition hover:border-primary focus-visible:outline focus-visible:outline-2"
          >
            <div className="flex justify-between gap-2">
              <h2 className="font-semibold">{p.serialNumber}</h2>
              <span className="text-xs">
                {m.products.statusValues[p.status]}
              </span>
            </div>
            <p className="text-sm">
              {p.worker ?? m.products.notSet} · {p.role ?? m.products.notSet}
            </p>
            <p className="text-sm">{p.location ?? m.products.notSet}</p>
            <p className="text-sm text-muted-foreground">
              {p.order} {p.customer}
            </p>
            <div className="flex gap-2 text-xs text-amber-800">
              {p.isUrgent ? <span>{o.urgent}</span> : null}
              {p.delayed ? <span>{o.delayed}</span> : null}
              {p.openIssues ? (
                <span>
                  {o.openIssues}: {p.openIssues}
                </span>
              ) : null}
            </div>
          </Link>
        ))}
      </div>
      {!data.products.length ? <p>{o.empty}</p> : null}
      <nav className="flex gap-6">
        {data.filters.page > 1 ? (
          <Link href={href(data.filters.page - 1)}>{o.previous}</Link>
        ) : null}
        {data.filters.page * 30 < data.total ? (
          <Link href={href(data.filters.page + 1)}>{o.next}</Link>
        ) : null}
      </nav>
    </main>
  );
}
