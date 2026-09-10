import {
  requireAuthenticatedUser,
  getTenantContext,
  getPermissionsForMembership,
} from "@/modules/authorization";
import { isFactoryFlowAuthError } from "@/modules/auth/auth-errors";
import { getFactorySetup } from "@/modules/administration/admin.service";
import { FactorySetup } from "@/modules/administration/setup";
import { UserSettings } from "@/modules/administration/user-settings";

export default async function SettingsPage() {
  const user = await requireAuthenticatedUser();
  let tenant = null;
  let permissions: ReadonlySet<string> = new Set();
  try {
    tenant = await getTenantContext();
    if (tenant) {
      permissions = await getPermissionsForMembership(tenant);
    }
  } catch (error) {
    if (!isFactoryFlowAuthError(error)) throw error;
  }

  const canAdmin = [
    "users.manage",
    "access_roles.manage",
    "production_roles.manage",
    "locations.manage",
    "products.create",
  ].some((p) => permissions.has(p));

  const setupData = canAdmin ? await getFactorySetup() : null;

  return (
    <main className="mx-auto max-w-5xl space-y-10 px-4 py-8">
      <UserSettings
        username={user.username}
        organizationName={tenant?.organizationName}
      />
      {setupData ? (
        <div className="border-t border-slate-200/80 pt-8">
          <FactorySetup data={setupData} />
        </div>
      ) : null}
    </main>
  );
}
