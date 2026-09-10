import { getRequestMessages } from "@/lib/i18n/server";
import Link from "next/link";
import { getOperationalDashboard } from "@/modules/reports/operations.service";
import {
  LayoutDashboard,
  Package,
  AlertTriangle,
  Clock,
  AlertCircle,
  TrendingUp,
  ArrowRight,
  Sparkles,
} from "lucide-react";

export default async function DashboardPage() {
  const data = await getOperationalDashboard();
  const m = await getRequestMessages();
  const o = m.operations;

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      {/* Dashboard Banner */}
      <header className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-white p-6 shadow-sm border border-slate-200">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-violet-600">
            <LayoutDashboard className="h-4 w-4" />
            <span>Priority Analytics Hub</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            {o.dashboard}
          </h1>
          <p className="text-xs text-slate-500">
            Live factory status overview and production bottlenecks
          </p>
        </div>

        <Link
          className="flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-bold text-white shadow-xs transition-colors hover:bg-blue-700 active:scale-95"
          href="/app/products"
        >
          <Package className="h-4 w-4" />
          <span>{o.products}</span>
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </header>

      {/* Production Status KPI Tiles Grid */}
      <section className="space-y-3">
        <h2 className="text-sm font-bold text-slate-700 flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-blue-600" />
          <span>Production Status Overview</span>
        </h2>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {data.counts.map((c) => {
            const isCompleted = c.status === "COMPLETED";
            const isInProgress = c.status === "IN_PROGRESS";
            return (
              <Link
                key={c.status}
                href={`/app/products?status=${c.status}`}
                className={`group flex flex-col justify-between rounded-2xl border p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${
                  isCompleted
                    ? "bg-emerald-50/40 border-emerald-200 hover:border-emerald-500"
                    : isInProgress
                    ? "bg-blue-50/40 border-blue-200 hover:border-blue-500"
                    : "bg-white border-slate-200 hover:border-blue-500"
                }`}
              >
                <div className="space-y-1">
                  <span className="text-xs font-bold text-slate-500 group-hover:text-blue-600">
                    {m.products.statusValues[c.status]}
                  </span>
                  <p className="text-3xl font-extrabold tracking-tight text-slate-900">
                    {c.count}
                  </p>
                </div>
                <div className="mt-3 flex items-center justify-between text-[11px] font-semibold text-slate-400 group-hover:text-blue-600">
                  <span>View products</span>
                  <ArrowRight className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Operational Alerts & Bottlenecks Strip */}
      <section className="space-y-3 pt-2">
        <h2 className="text-sm font-bold text-slate-700 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <span>Bottlenecks & Attention Required</span>
        </h2>

        <div className="grid gap-4 sm:grid-cols-3">
          {[
            [o.urgent, data.urgent, "urgent", <AlertTriangle key="urg" className="h-5 w-5 text-red-600" />],
            [o.delayed, data.delayed, "delayed", <Clock key="del" className="h-5 w-5 text-amber-600" />],
            ...(data.issues === null
              ? []
              : [[o.openIssues, data.issues, "issues", <AlertCircle key="iss" className="h-5 w-5 text-rose-600" />]]),
          ].map(([label, count, filter, icon]) => (
            <Link
              key={String(filter)}
              href={`/app/products?${filter}=true`}
              className="flex items-center justify-between rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50/80 to-orange-50/50 p-5 shadow-sm transition-all hover:border-amber-400 hover:shadow-md"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  {icon}
                  <span className="text-xs font-bold text-slate-800">{label}</span>
                </div>
                <p className="text-3xl font-black text-slate-900">{count}</p>
              </div>
              <ArrowRight className="h-5 w-5 text-amber-600" />
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
