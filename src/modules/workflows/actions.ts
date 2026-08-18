"use server";

import { revalidatePath } from "next/cache";

import { isFactoryFlowAuthError } from "@/modules/auth/auth-errors";

import {
  createWorkflowTemplate,
  createWorkflowTemplateVersion,
  isWorkflowError,
  setWorkflowTemplateActive,
} from "./server";
import type { WorkflowActionState } from "./workflow-action-types";
import type { WorkflowTemplateStageInput } from "./workflow-types";

function getString(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function parseStages(value: string): readonly WorkflowTemplateStageInput[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.map((stage) => {
          const candidate = stage as Record<string, unknown>;
          return {
            code: candidate.code,
            name: candidate.name,
            position: candidate.position,
            productionRoleId: candidate.productionRoleId,
          } as WorkflowTemplateStageInput;
        })
      : [];
  } catch {
    return [];
  }
}

export async function workflowAction(
  _previousState: WorkflowActionState,
  formData: FormData,
): Promise<WorkflowActionState> {
  try {
    const operation = getString(formData, "operation");
    if (operation === "create") {
      await createWorkflowTemplate({
        name: getString(formData, "name"),
        stages: parseStages(getString(formData, "stages")),
      });
    } else if (operation === "version") {
      await createWorkflowTemplateVersion({
        sourceTemplateId: getString(formData, "sourceTemplateId"),
        stages: parseStages(getString(formData, "stages")),
      });
    } else if (operation === "activate" || operation === "deactivate") {
      await setWorkflowTemplateActive(
        getString(formData, "workflowTemplateId"),
        operation === "activate",
      );
    } else {
      return { success: false, errorCode: "INVALID_WORKFLOW_INPUT" };
    }

    revalidatePath("/app/workflows");
    return { success: true, errorCode: null };
  } catch (error) {
    if (isWorkflowError(error)) {
      return { success: false, errorCode: error.code };
    }
    if (isFactoryFlowAuthError(error)) {
      return {
        success: false,
        errorCode: error.code === "FORBIDDEN" ? "FORBIDDEN" : "UNAUTHORIZED",
      };
    }
    return { success: false, errorCode: "INVALID_WORKFLOW_INPUT" };
  }
}
