import { redirect } from "next/navigation";

import { defaultLocale, getMessages } from "@/lib/i18n";
import { logoutAction } from "@/modules/auth/actions";
import { isFactoryFlowAuthError } from "@/modules/auth/auth-errors";
import { requireAuthenticatedUser } from "@/modules/authorization/authorization.service";
import { getTenantContext } from "@/modules/authorization/tenant-context";

const messages = getMessages(defaultLocale);

export default async function AppPage() {
  let user;
  try {
    user = await requireAuthenticatedUser();
  } catch {
    redirect("/login");
  }

  let organizationName: string | null = null;
  let organizationSelectionRequired = false;

  try {
    organizationName = (await getTenantContext())?.organizationName ?? null;
  } catch (error) {
    if (
      isFactoryFlowAuthError(error) &&
      error.code === "ORGANIZATION_SELECTION_REQUIRED"
    ) {
      organizationSelectionRequired = true;
    }
  }

  return (
    <main className="min-h-screen px-6 py-12">
      <section className="mx-auto w-full max-w-2xl space-y-8 rounded-xl border bg-white p-8 shadow-sm">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">
              {messages.app.title}
            </p>
            <h1 className="text-3xl font-semibold tracking-tight">
              {messages.app.welcome}, {user.username ?? ""}
            </h1>
          </div>
          <form action={logoutAction}>
            <button
              className="inline-flex h-10 items-center justify-center rounded-md border px-4 text-sm font-medium transition-colors hover:bg-muted"
              type="submit"
            >
              {messages.app.logout}
            </button>
          </form>
        </div>

        {organizationSelectionRequired ? (
          <p className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
            {messages.app.organizationSelectionRequired}
          </p>
        ) : organizationName ? (
          <p className="rounded-md border bg-muted/40 p-4 text-sm">
            <span className="font-medium">{messages.app.organization}:</span>{" "}
            {organizationName}
          </p>
        ) : (
          <p className="rounded-md border bg-muted/40 p-4 text-sm">
            {messages.app.noOrganization}
          </p>
        )}
      </section>
    </main>
  );
}
