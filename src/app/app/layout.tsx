import { redirect } from "next/navigation";
import {
  requireAuthenticatedUser,
  getTenantContext,
  getPermissionsForMembership,
} from "@/modules/authorization";
import { isFactoryFlowAuthError } from "@/modules/auth/auth-errors";
import { getRequestMessages } from "@/lib/i18n/server";
import { Navbar } from "@/components/layout/Navbar";
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
  let orgName: string | undefined;
  try {
    const context = await getTenantContext();
    if (context) {
      permissions = await getPermissionsForMembership(context);
      orgName = context.organizationId;
    }
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
    <div className="min-h-screen bg-slate-50/50">
      <Navbar
        appName={m.app.title as string}
        links={links}
        languagePicker={<LanguagePicker />}
        organizationName={orgName}
        userName={user.username}
      />
      <main>{children}</main>
    </div>
  );
}
