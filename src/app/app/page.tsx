import Link from "next/link";
import { getRequestMessages } from "@/lib/i18n/server";
import { requireAuthenticatedUser, getTenantContext, getPermissionsForMembership } from "@/modules/authorization";
import { isFactoryFlowAuthError } from "@/modules/auth/auth-errors";
import { prisma } from "@/lib/db/client";
import { logoutAction } from "@/modules/auth/actions";
import { selectOrganization } from "@/modules/auth/preferences";
export default async function AppPage() {
  const user = await requireAuthenticatedUser();
  const m = await getRequestMessages();
  const memberships = await prisma.membership.findMany({ where: { userId: user.userId, status: "ACTIVE" }, select: { organization: { select: { id: true, name: true } } } });
  let tenant = null;
  try { tenant = await getTenantContext(); } catch (error) { if (!isFactoryFlowAuthError(error)) throw error; }
  const permissions = tenant ? await getPermissionsForMembership(tenant) : new Set<string>();
  const links = [
    { href: "/app/worker", label: m.worker.myWork, permission: "scans.perform" },
    { href: "/app/products", label: m.operations.products, permission: "products.read" },
    { href: "/app/products/new", label: m.products.create, permission: "products.create" },
    { href: "/app/dashboard", label: m.operations.dashboard, permission: "products.read" },
    { href: "/app/workflows", label: m.workflows.title, permission: "workflows.manage" },
    { href: "/app/reports", label: m.operations.reports, permission: "reports.export" },
  ].filter(l => permissions.has(l.permission));
  return <main className="mx-auto max-w-5xl space-y-6 px-4 py-8"><header className="flex flex-wrap justify-between gap-4"><h1 className="text-3xl font-semibold">{m.app.welcome}, {user.username}</h1><form action={logoutAction}><button className="rounded border px-4 py-2">{m.app.logout}</button></form></header>
    {tenant ? <p>{m.app.organization}: {tenant.organizationName}</p> : <p>{memberships.length ? m.app.organizationSelectionRequired : m.app.noOrganization}</p>}
    {memberships.length > 1 ? <form action={selectOrganization} className="flex flex-wrap gap-3 rounded-xl border bg-white p-5"><label>{m.operations.organization}<select name="organizationId" defaultValue={tenant?.organizationId ?? ""} required className="ms-3 rounded border p-2"><option value="">{m.operations.selectOrganization}</option>{memberships.map(member => <option key={member.organization.id} value={member.organization.id}>{member.organization.name}</option>)}</select></label><button className="rounded border px-4 py-2">{m.operations.selectOrganization}</button></form> : null}
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{links.map(l => <Link href={l.href} key={l.href} className="rounded-xl border bg-white p-6 text-lg font-medium shadow-sm hover:border-primary">{l.label}</Link>)}</div>
    {user.isSystemAdmin ? <Link href="/app/platform" className="inline-block rounded bg-primary px-5 py-3 text-primary-foreground">{m.operations.platform}</Link> : null}
  </main>;
}
