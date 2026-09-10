import { getRequestMessages } from "@/lib/i18n/server";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { listOperationalProducts } from "@/modules/reports/operations.service";
import { cleanSearchParams } from "@/modules/reports/product-filters";
import { isFactoryFlowAuthError } from "@/modules/auth/auth-errors";
import { ApplicationError } from "@/shared/errors";
import {
  Package,
  PlusCircle,
  Search,
  Filter,
  AlertTriangle,
  Clock,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  User,
  MapPin,
  Tag,
  Layers,
} from "lucide-react";

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
          <p role="alert" className="text-destructive font-semibold">{o.errors.INVALID_INPUT}</p>
          <Link href="/app/products" className="mt-2 inline-block text-blue-600 underline">{o.products}</Link>
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

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "CREATED":
        return <span className="priority-badge-created">{m.products.statusValues.CREATED}</span>;
      case "IN_PROGRESS":
        return <span className="priority-badge-in-progress">{m.products.statusValues.IN_PROGRESS}</span>;
      case "READY_FOR_HANDOFF":
        return <span className="priority-badge-in-progress bg-indigo-50 text-indigo-700 ring-indigo-600/20">{m.products.statusValues.READY_FOR_HANDOFF}</span>;
      case "COMPLETED":
        return <span className="priority-badge-completed">{m.products.statusValues.COMPLETED}</span>;
      case "CANCELLED":
        return <span className="priority-badge-rework">{m.products.statusValues.CANCELLED}</span>;
      default:
        return <span className="priority-badge-created">{status}</span>;
    }
  };

  return (
    <main className="mx-auto max-w-7xl space-y-6 px-4 py-8">
      {/* Header Banner */}
      <header className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-white p-6 shadow-sm border border-slate-200">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-blue-600">
            <Package className="h-4 w-4" />
            <span>Priority Inventory Grid</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            {o.products}
          </h1>
          <p className="text-xs text-slate-500">
            {o.total}: <strong className="text-slate-900">{data.total}</strong> products tracked
          </p>
        </div>

        {data.canCreate ? (
          <Link
            className="flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-bold text-white shadow-xs transition-colors hover:bg-blue-700 active:scale-95"
            href="/app/products/new"
          >
            <PlusCircle className="h-4 w-4" />
            <span>{m.products.create}</span>
          </Link>
        ) : null}
      </header>

      {/* Filter Toolbar */}
      <form className="space-y-4 rounded-2xl bg-white p-5 shadow-sm border border-slate-200">
        <div className="flex items-center justify-between border-b pb-3 text-xs font-bold text-slate-700">
          <div className="flex items-center gap-1.5">
            <Filter className="h-4 w-4 text-blue-600" />
            <span>Search & Filter Toolbar</span>
          </div>
          <button
            className="rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-bold text-white shadow-xs transition-colors hover:bg-blue-700"
            type="submit"
          >
            {o.filter}
          </button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <label className="text-xs font-semibold text-slate-700 sm:col-span-2">
            <span className="block mb-1">{o.search}</span>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                name="q"
                defaultValue={data.filters.q}
                maxLength={200}
                placeholder="Barcode or serial number..."
                className="w-full rounded-lg border border-slate-300 bg-slate-50/50 py-2 pl-9 pr-3 text-xs text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none"
              />
            </div>
          </label>

          <label className="text-xs font-semibold text-slate-700">
            <span className="block mb-1">{o.status}</span>
            <select
              name="status"
              defaultValue={data.filters.status ?? ""}
              className="w-full rounded-lg border border-slate-300 bg-slate-50/50 py-2 px-3 text-xs text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none"
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
            ] as const
          ).map(([name, label, options]) => (
            <label className="text-xs font-semibold text-slate-700" key={name}>
              <span className="block mb-1">{label}</span>
              <select
                name={name}
                defaultValue={data.filters[name] ?? ""}
                className="w-full rounded-lg border border-slate-300 bg-slate-50/50 py-2 px-3 text-xs text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none"
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
        </div>

        <div className="flex flex-wrap items-center gap-6 border-t pt-3 text-xs font-medium text-slate-700">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              name="urgent"
              value="true"
              defaultChecked={Boolean(data.filters.urgent)}
              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="flex items-center gap-1">
              <AlertTriangle className="h-3.5 w-3.5 text-red-600" />
              <span>{o.urgent}</span>
            </span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              name="delayed"
              value="true"
              defaultChecked={Boolean(data.filters.delayed)}
              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5 text-amber-600" />
              <span>{o.delayed}</span>
            </span>
          </label>

          {data.canReadIssues ? (
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                name="issues"
                value="true"
                defaultChecked={Boolean(data.filters.issues)}
                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="flex items-center gap-1">
                <AlertCircle className="h-3.5 w-3.5 text-rose-600" />
                <span>{o.openIssues}</span>
              </span>
            </label>
          ) : null}
        </div>
      </form>

      {/* Priority Web Data Grid */}
      <div
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
        data-testid="product-results"
      >
        {data.products.map((p) => (
          <Link
            href={`/app/products/${p.id}`}
            key={p.id}
            className="group relative flex flex-col justify-between rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-blue-500 hover:shadow-md"
          >
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-2 border-b pb-3">
                <div className="space-y-0.5">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    Serial #
                  </span>
                  <h2 className="text-lg font-bold text-slate-900 group-hover:text-blue-600">
                    {p.serialNumber}
                  </h2>
                </div>
                <div>{getStatusBadge(p.status)}</div>
              </div>

              <div className="space-y-2 text-xs text-slate-600">
                <div className="flex items-center gap-2">
                  <User className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                  <span className="font-medium text-slate-900">
                    {p.worker ?? m.products.notSet}
                  </span>
                  <span className="text-slate-400">·</span>
                  <span className="text-slate-500">{p.role ?? m.products.notSet}</span>
                </div>

                <div className="flex items-center gap-2">
                  <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                  <span>{p.location ?? m.products.notSet}</span>
                </div>

                {p.order || p.customer ? (
                  <div className="flex items-center gap-2">
                    <Tag className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                    <span>
                      {p.order} {p.customer}
                    </span>
                  </div>
                ) : null}
              </div>
            </div>

            {/* Badges strip */}
            {(p.isUrgent || p.delayed || p.openIssues) && (
              <div className="mt-4 flex flex-wrap gap-1.5 border-t pt-3 text-[11px] font-semibold">
                {p.isUrgent ? (
                  <span className="priority-badge-urgent">
                    {o.urgent}
                  </span>
                ) : null}
                {p.delayed ? (
                  <span className="inline-flex items-center rounded-md bg-amber-100 px-2 py-0.5 text-amber-900">
                    {o.delayed}
                  </span>
                ) : null}
                {p.openIssues ? (
                  <span className="inline-flex items-center rounded-md bg-rose-100 px-2 py-0.5 text-rose-900">
                    {o.openIssues}: {p.openIssues}
                  </span>
                ) : null}
              </div>
            )}
          </Link>
        ))}
      </div>

      {!data.products.length ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center text-slate-500">
          <Package className="mx-auto h-10 w-10 text-slate-400" />
          <p className="mt-2 text-sm font-medium">{o.empty}</p>
        </div>
      ) : null}

      {/* Pagination Bar */}
      <nav className="flex items-center justify-between border-t pt-4 text-xs font-semibold text-slate-700">
        <div>
          <span>Showing page {data.filters.page}</span>
        </div>
        <div className="flex gap-3">
          {data.filters.page > 1 ? (
            <Link
              href={href(data.filters.page - 1)}
              className="flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 shadow-xs hover:bg-slate-50"
            >
              <ChevronLeft className="h-4 w-4" />
              <span>{o.previous}</span>
            </Link>
          ) : null}
          {data.filters.page * 30 < data.total ? (
            <Link
              href={href(data.filters.page + 1)}
              className="flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 shadow-xs hover:bg-slate-50"
            >
              <span>{o.next}</span>
              <ChevronRight className="h-4 w-4" />
            </Link>
          ) : null}
        </div>
      </nav>
    </main>
  );
}
