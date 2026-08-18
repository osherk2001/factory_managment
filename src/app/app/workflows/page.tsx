import { notFound, redirect } from "next/navigation";

import { defaultLocale, getMessages } from "@/lib/i18n";
import { prisma } from "@/lib/db/client";
import { isFactoryFlowAuthError } from "@/modules/auth/auth-errors";
import { requirePermission } from "@/modules/authorization";
import { listWorkflowTemplates } from "@/modules/workflows/server";
import { WorkflowManagement } from "@/modules/workflows/workflow-management";

const messages = getMessages(defaultLocale);

export default async function WorkflowsPage() {
  let context;
  try {
    context = await requirePermission("workflows.manage");
  } catch (error) {
    if (isFactoryFlowAuthError(error) && error.code === "UNAUTHENTICATED") {
      redirect("/login");
    }
    notFound();
  }

  const [templates, roles] = await Promise.all([
    listWorkflowTemplates(),
    prisma.productionRole.findMany({
      where: { organizationId: context.organizationId, isActive: true },
      orderBy: [{ name: "asc" }, { code: "asc" }],
      select: { id: true, code: true, name: true },
    }),
  ]);

  return (
    <main className="min-h-screen px-4 py-8 sm:px-6 sm:py-12">
      <section className="mx-auto w-full max-w-4xl space-y-6">
        <header className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">
            FactoryFlow
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">
            {messages.workflows.title}
          </h1>
          <p className="text-sm text-muted-foreground">
            {messages.workflows.description}
          </p>
        </header>
        <WorkflowManagement roles={roles} templates={templates} />
      </section>
    </main>
  );
}
