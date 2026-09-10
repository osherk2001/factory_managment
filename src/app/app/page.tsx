import Link from "next/link";
import { getRequestMessages } from "@/lib/i18n/server";
import {
  requireAuthenticatedUser,
  getTenantContext,
  getPermissionsForMembership,
} from "@/modules/authorization";
import { isFactoryFlowAuthError } from "@/modules/auth/auth-errors";
import { prisma } from "@/lib/db/client";
import { logoutAction } from "@/modules/auth/actions";
import { selectOrganization } from "@/modules/auth/preferences";
import {
  QrCode,
  Package,
  PlusCircle,
  LayoutDashboard,
  GitMerge,
  FileText,
  LogOut,
  Building2,
  ShieldCheck,
  Server,
  ArrowUpRight,
} from "lucide-react";

export default async function AppPage() {
  const user = await requireAuthenticatedUser();
  const m = await getRequestMessages();
  const memberships = await prisma.membership.findMany({
    where: { userId: user.userId, status: "ACTIVE" },
    select: { organization: { select: { id: true, name: true } } },
  });
  let tenant = null;
  try {
    tenant = await getTenantContext();
  } catch (error) {
    if (!isFactoryFlowAuthError(error)) throw error;
  }
  const permissions = tenant
    ? await getPermissionsForMembership(tenant)
    : new Set<string>();

  const linkConfigs = [
    {
      href: "/app/worker",
      label: m.worker.myWork,
      permission: "scans.perform",
      icon: <QrCode className="h-6 w-6 text-emerald-600" />,
      badge: "Fast Scan",
      desc: "Scan barcodes, record production step transitions & update weight.",
    },
    {
      href: "/app/products",
      label: m.operations.products,
      permission: "products.read",
      icon: <Package className="h-6 w-6 text-blue-600" />,
      badge: "Catalog",
      desc: "Search, filter, view and print barcode labels for products.",
    },
    {
      href: "/app/products/new",
      label: m.products.create,
      permission: "products.create",
      icon: <PlusCircle className="h-6 w-6 text-indigo-600" />,
      badge: "Creation",
      desc: "Generate new physical product tracking unit with unique barcode.",
    },
    {
      href: "/app/dashboard",
      label: m.operations.dashboard,
      permission: "products.read",
      icon: <LayoutDashboard className="h-6 w-6 text-violet-600" />,
      badge: "Analytics",
      desc: "Live KPI metrics, active worker status and production throughput.",
    },
    {
      href: "/app/workflows",
      label: m.workflows.title,
      permission: "workflows.manage",
      icon: <GitMerge className="h-6 w-6 text-amber-600" />,
      badge: "Config",
      desc: "Configure factory workflow templates, stages and routing logic.",
    },
    {
      href: "/app/reports",
      label: m.operations.reports,
      permission: "reports.export",
      icon: <FileText className="h-6 w-6 text-teal-600" />,
      badge: "Export",
      desc: "Export decimal material balances, stage summary & movement history.",
    },
  ];

  const links = linkConfigs.filter((l) => permissions.has(l.permission));

  return (
    <main className="mx-auto max-w-6xl space-y-8 px-4 py-8">
      {/* Welcome Header */}
      <header className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 p-6 text-white shadow-lg">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-blue-400">
            <ShieldCheck className="h-4 w-4" />
            <span>FactoryFlow Hub</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            {m.app.welcome}, {user.username}
          </h1>
          {tenant ? (
            <div className="flex items-center gap-2 text-sm text-slate-300">
              <Building2 className="h-4 w-4 text-slate-400" />
              <span>
                {m.app.organization}: <strong>{tenant.organizationName}</strong>
              </span>
            </div>
          ) : (
            <p className="text-sm text-amber-300">
              {memberships.length
                ? m.app.organizationSelectionRequired
                : m.app.noOrganization}
            </p>
          )}
        </div>

        <form action={logoutAction}>
          <button className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800/80 px-4 py-2 text-xs font-semibold text-slate-200 transition-colors hover:bg-rose-600 hover:text-white">
            <LogOut className="h-4 w-4" />
            <span>{m.app.logout}</span>
          </button>
        </form>
      </header>

      {/* Organization Switcher if user has multiple org memberships */}
      {memberships.length > 1 ? (
        <section className="priority-card border-amber-200 bg-amber-50/40">
          <form
            action={selectOrganization}
            className="flex flex-wrap items-center gap-4"
          >
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-amber-700" />
              <label className="text-sm font-semibold text-slate-800">
                {m.operations.organization}:
              </label>
            </div>
            <select
              name="organizationId"
              defaultValue={tenant?.organizationId ?? ""}
              required
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium shadow-xs focus:border-blue-500 focus:outline-none"
            >
              <option value="">{m.operations.selectOrganization}</option>
              {memberships.map((member) => (
                <option
                  key={member.organization.id}
                  value={member.organization.id}
                >
                  {member.organization.name}
                </option>
              ))}
            </select>
            <button className="rounded-lg bg-amber-600 px-4 py-1.5 text-xs font-bold text-white shadow-xs transition-colors hover:bg-amber-700">
              {m.operations.selectOrganization}
            </button>
          </form>
        </section>
      ) : null}

      {/* Operations Quick Action Tiles Grid */}
      <section className="space-y-4">
        <div className="flex items-center justify-between border-b pb-2">
          <h2 className="text-lg font-bold text-slate-900">
            Operational Modules
          </h2>
          <span className="text-xs font-semibold text-slate-500">
            Priority Web Workstation
          </span>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {links.map((l) => (
            <Link
              href={l.href}
              key={l.href}
              className="group relative flex flex-col justify-between rounded-xl border border-slate-200/80 bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-blue-500 hover:shadow-md"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-50 group-hover:bg-blue-50">
                    {l.icon}
                  </div>
                  <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-600 group-hover:bg-blue-100 group-hover:text-blue-800">
                    {l.badge}
                  </span>
                </div>
                <div>
                  <h3 className="flex items-center gap-1 text-base font-bold text-slate-900 group-hover:text-blue-600">
                    <span>{l.label}</span>
                    <ArrowUpRight className="h-4 w-4 opacity-0 transition-opacity group-hover:opacity-100" />
                  </h3>
                  <p className="mt-1 text-xs leading-relaxed text-slate-500">
                    {l.desc}
                  </p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* System Admin Platform Gateway */}
      {user.isSystemAdmin ? (
        <section className="flex items-center justify-between gap-4 rounded-xl border border-blue-200 bg-blue-50/50 p-5">
          <div className="flex items-center gap-3">
            <Server className="h-6 w-6 text-blue-600" />
            <div>
              <h4 className="text-sm font-bold text-slate-900">
                Platform Administration
              </h4>
              <p className="text-xs text-slate-600">
                System admin tenant provisioning & multi-factory management.
              </p>
            </div>
          </div>
          <Link
            href="/app/platform"
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-xs transition-colors hover:bg-blue-700"
          >
            <span>{m.operations.platform}</span>
            <ArrowUpRight className="h-4 w-4" />
          </Link>
        </section>
      ) : null}
    </main>
  );
}
