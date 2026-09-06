import Link from "next/link";
import { redirect } from "next/navigation";
import {
  requireAuthenticatedUser,
  getTenantContext,
  getPermissionsForMembership,
} from "@/modules/authorization";
import { isFactoryFlowAuthError } from "@/modules/auth/auth-errors";
import { getRequestMessages } from "@/lib/i18n/server";
import { LanguagePicker } from "@/components/language-picker";
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let user;
  try {
    user = await requireAuthenticatedUser();
  } catch (error) {
    if (isFactoryFlowAuthError(error)) redirect("/login");
    throw error;
  }
  const m = await getRequestMessages();
  let permissions: ReadonlySet<string> = new Set();
  try {
    const context = await getTenantContext();
    if (context) permissions = await getPermissionsForMembership(context);
  } catch (error) {
    if (!isFactoryFlowAuthError(error)) throw error;
  }
  const links = [{ href: "/app", label: m.operations.home as string }];
  if (permissions.has("scans.perform"))
    links.push({ href: "/app/worker", label: m.worker.myWork });
  if (permissions.has("products.read"))
    links.push(
      { href: "/app/products", label: m.operations.products },
      { href: "/app/dashboard", label: m.operations.dashboard },
    );
  if (permissions.has("products.create"))
    links.push({ href: "/app/products/new", label: m.products.create });
  if (permissions.has("workflows.manage"))
    links.push({ href: "/app/workflows", label: m.workflows.title });
  if (
    [
      "users.manage",
      "access_roles.manage",
      "production_roles.manage",
      "locations.manage",
      "products.create",
    ].some((p) => permissions.has(p))
  )
    links.push({ href: "/app/settings", label: m.operations.administration });
  if (permissions.has("reports.export"))
    links.push({ href: "/app/reports", label: m.operations.reports });
  if (permissions.has("audit.read"))
    links.push({ href: "/app/audit", label: m.operations.audit });
  if (user.isSystemAdmin)
    links.push({ href: "/app/platform", label: m.operations.platform });
  return (
    <>
      <header className="border-b bg-white px-4 py-3 print:hidden">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
          <Link href="/app" className="font-bold tracking-tight">
            {m.app.title}
          </Link>
          <LanguagePicker />
        </div>
        <nav className="mx-auto mt-3 flex max-w-6xl gap-2 overflow-x-auto pb-1">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="shrink-0 rounded-md px-3 py-2 text-sm hover:bg-muted"
            >
              {l.label}
            </Link>
          ))}
        </nav>
      </header>
      {children}
    </>
  );
}
