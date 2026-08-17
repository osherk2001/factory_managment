"use server";

import { isFactoryFlowAuthError } from "@/modules/auth/auth-errors";

import { isWorkerContextError } from "./worker-context.errors";
import { selectActiveProductionRole } from "./production-role-context.service";
import type { WorkerRoleSelectionActionState } from "./worker-action-types";

function getRequestedRoleId(formData: FormData): string {
  const value = formData.get("productionRoleId");
  return typeof value === "string" ? value : "";
}

export async function selectActiveProductionRoleAction(
  previousState: WorkerRoleSelectionActionState,
  formData: FormData,
): Promise<WorkerRoleSelectionActionState> {
  try {
    const state = await selectActiveProductionRole(
      getRequestedRoleId(formData),
    );

    return {
      activeProductionRoleId: state.activeProductionRole?.id ?? null,
      errorCode: null,
    };
  } catch (error) {
    if (isWorkerContextError(error)) {
      return { ...previousState, errorCode: error.code };
    }

    if (isFactoryFlowAuthError(error)) {
      return {
        ...previousState,
        errorCode: error.code === "FORBIDDEN" ? "FORBIDDEN" : "UNAUTHORIZED",
      };
    }

    return {
      ...previousState,
      errorCode: "PRODUCTION_ROLE_NOT_AVAILABLE",
    };
  }
}
