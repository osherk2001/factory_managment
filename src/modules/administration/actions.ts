"use server";
import { revalidatePath } from "next/cache";
import { actionError } from "@/shared/actions/action-error";
import { formString, type ActionState } from "@/shared/actions/action-state";
import {
  createOrganization,
  createFactoryUser,
  resetFactoryPassword,
  updateMemberAccess,
  saveAccessRole,
  assignProductionRole,
  createReference,
} from "./admin.service";

export async function administrationAction(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const get = (name: string) => formString(form, name);
    switch (get("operation")) {
      case "organization":
        await createOrganization({
          name: get("name"),
          slug: get("slug"),
          username: get("username"),
          password: get("password"),
        });
        break;
      case "user":
        await createFactoryUser({
          username: get("username"),
          password: get("password"),
          displayName: get("displayName"),
          accessRoleId: get("accessRoleId"),
        });
        break;
      case "password":
        await resetFactoryPassword({
          membershipId: get("membershipId"),
          password: get("password"),
        });
        break;
      case "access":
        await updateMemberAccess({
          membershipId: get("membershipId"),
          accessRoleId: get("accessRoleId"),
          active: get("active") === "true",
        });
        break;
      case "role":
        await saveAccessRole({
          id: get("id") || undefined,
          code: get("code"),
          name: get("name"),
          permissions: form.getAll("permissions"),
        });
        break;
      case "assignment":
        await assignProductionRole({
          employeeId: get("employeeId"),
          productionRoleId: get("productionRoleId"),
          handlingLocationId: get("handlingLocationId"),
        });
        break;
      default:
        await createReference({
          kind: get("operation"),
          code: get("code"),
          name: get("name"),
          type: get("type"),
          departmentId: get("departmentId") || undefined,
          customerId: get("customerId") || undefined,
          orderNumber: get("orderNumber"),
        });
    }
    revalidatePath("/app", "layout");
    return { errorCode: null, success: true };
  } catch (error) {
    return actionError(error);
  }
}
