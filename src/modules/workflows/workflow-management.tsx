"use client";

import { useActionState, useState } from "react";

import { defaultLocale, getMessages } from "@/lib/i18n";

import { workflowAction } from "./actions";
import {
  initialWorkflowActionState,
  type WorkflowActionState,
} from "./workflow-action-types";
import type { WorkflowTemplateDto } from "./workflow-types";

type RoleOption = { id: string; code: string; name: string };
type EditableStage = {
  clientId: string;
  code: string;
  name: string;
  position: number;
  productionRoleId: string;
};

const messages = getMessages(defaultLocale);

function newStage(position: number): EditableStage {
  return {
    clientId: crypto.randomUUID(),
    code: "",
    name: "",
    position,
    productionRoleId: "",
  };
}

function workflowError(state: WorkflowActionState): string | null {
  if (!state.errorCode) return null;
  if (state.errorCode === "FORBIDDEN" || state.errorCode === "UNAUTHORIZED") {
    return messages.workflows.unauthorized;
  }
  return messages.workflows.saveFailed;
}

export function WorkflowManagement({
  roles,
  templates,
}: {
  roles: readonly RoleOption[];
  templates: readonly WorkflowTemplateDto[];
}) {
  const [state, formAction, isSubmitting] = useActionState(
    workflowAction,
    initialWorkflowActionState,
  );
  const [mode, setMode] = useState<"create" | "version">("create");
  const [stages, setStages] = useState<EditableStage[]>([newStage(1)]);
  const error = workflowError(state);

  function updateStage(
    clientId: string,
    field: "code" | "name" | "productionRoleId",
    value: string,
  ) {
    setStages((current) =>
      current.map((stage) =>
        stage.clientId === clientId ? { ...stage, [field]: value } : stage,
      ),
    );
  }

  const serializedStages = JSON.stringify(
    stages.map(({ code, name, position, productionRoleId }) => ({
      code,
      name,
      position,
      productionRoleId: productionRoleId || null,
    })),
  );

  return (
    <div className="space-y-8">
      <section className="space-y-5 rounded-xl border bg-white p-5 shadow-sm">
        <div className="flex gap-2">
          <button
            aria-pressed={mode === "create"}
            className="rounded-lg border px-4 py-2"
            onClick={() => setMode("create")}
            type="button"
          >
            {messages.workflows.create}
          </button>
          <button
            aria-pressed={mode === "version"}
            className="rounded-lg border px-4 py-2"
            disabled={templates.length === 0}
            onClick={() => setMode("version")}
            type="button"
          >
            {messages.workflows.newVersion}
          </button>
        </div>

        <form action={formAction} className="space-y-5">
          <input name="operation" type="hidden" value={mode} />
          <input name="stages" type="hidden" value={serializedStages} />
          {mode === "create" ? (
            <label
              className="grid gap-2 text-sm font-medium"
              htmlFor="workflow-name"
            >
              {messages.workflows.name}
              <input
                className="h-11 rounded-md border px-3"
                id="workflow-name"
                name="name"
                required
              />
            </label>
          ) : (
            <label
              className="grid gap-2 text-sm font-medium"
              htmlFor="source-template"
            >
              {messages.workflows.sourceVersion}
              <select
                className="h-11 rounded-md border px-3"
                id="source-template"
                name="sourceTemplateId"
                required
              >
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name} · v{template.version}
                  </option>
                ))}
              </select>
            </label>
          )}

          <div className="space-y-3">
            <h2 className="text-lg font-semibold">
              {messages.workflows.stages}
            </h2>
            {stages.map((stage) => (
              <div
                className="grid gap-3 rounded-lg border p-3 sm:grid-cols-4"
                data-testid="workflow-stage-row"
                key={stage.clientId}
              >
                <input
                  aria-label={messages.workflows.stageCode}
                  className="h-11 rounded-md border px-3"
                  onChange={(event) =>
                    updateStage(stage.clientId, "code", event.target.value)
                  }
                  placeholder={messages.workflows.stageCode}
                  required
                  value={stage.code}
                />
                <input
                  aria-label={messages.workflows.stageName}
                  className="h-11 rounded-md border px-3"
                  onChange={(event) =>
                    updateStage(stage.clientId, "name", event.target.value)
                  }
                  placeholder={messages.workflows.stageName}
                  required
                  value={stage.name}
                />
                <input
                  aria-label={messages.workflows.position}
                  className="h-11 rounded-md border px-3"
                  disabled
                  value={stage.position}
                />
                <select
                  aria-label={messages.workflows.productionRole}
                  className="h-11 rounded-md border px-3"
                  onChange={(event) =>
                    updateStage(
                      stage.clientId,
                      "productionRoleId",
                      event.target.value,
                    )
                  }
                  value={stage.productionRoleId}
                >
                  <option value="">{messages.workflows.unmapped}</option>
                  {roles.map((role) => (
                    <option key={role.id} value={role.id}>
                      {role.code} · {role.name}
                    </option>
                  ))}
                </select>
              </div>
            ))}
            <button
              className="rounded-lg border px-4 py-2"
              data-testid="add-workflow-stage"
              onClick={() =>
                setStages((current) => [
                  ...current,
                  newStage(current.length + 1),
                ])
              }
              type="button"
            >
              {messages.workflows.addStage}
            </button>
          </div>

          {error ? (
            <p className="text-destructive text-sm" role="alert">
              {error}
            </p>
          ) : null}
          {state.success ? (
            <p aria-live="polite" data-testid="workflow-saved">
              {messages.workflows.saved}
            </p>
          ) : null}
          <button
            className="min-h-12 w-full rounded-xl bg-primary px-5 py-3 font-semibold text-primary-foreground"
            data-testid="save-workflow"
            disabled={isSubmitting}
            type="submit"
          >
            {messages.workflows.save}
          </button>
        </form>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">
          {messages.workflows.templates}
        </h2>
        {templates.map((template) => (
          <article
            className="space-y-3 rounded-xl border bg-white p-5 shadow-sm"
            data-testid="workflow-template"
            key={template.id}
          >
            <div className="flex items-center justify-between gap-4">
              <h3 className="text-lg font-semibold">
                {template.name} · v{template.version}
              </h3>
              <span>
                {template.isActive
                  ? messages.workflows.active
                  : messages.workflows.inactive}
              </span>
            </div>
            <ol className="space-y-1 text-sm">
              {template.stages.map((stage) => (
                <li key={stage.id}>
                  {stage.position}. {stage.name} ({stage.code}) ·{" "}
                  {stage.productionRole?.name ?? messages.workflows.unmapped}
                </li>
              ))}
            </ol>
            <form action={formAction}>
              <input
                name="workflowTemplateId"
                type="hidden"
                value={template.id}
              />
              <button
                className="rounded-lg border px-4 py-2"
                disabled={isSubmitting}
                name="operation"
                type="submit"
                value={template.isActive ? "deactivate" : "activate"}
              >
                {template.isActive
                  ? messages.workflows.deactivate
                  : messages.workflows.activate}
              </button>
            </form>
          </article>
        ))}
      </section>
    </div>
  );
}
