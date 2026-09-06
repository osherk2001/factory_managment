"use server";
import { revalidatePath } from "next/cache";
import { createIssue, resolveIssue } from "./issue.service";
import { formString, type ActionState } from "@/shared/actions/action-state";
import { actionError } from "@/shared/actions/action-error";

export async function createIssueAction(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const result = await createIssue({
      productId: formString(form, "productId"),
      type: formString(form, "type"),
      description: formString(form, "description"),
      idempotencyKey: formString(form, "idempotencyKey"),
    });
    revalidatePath(`/app/products/${result.productId}`);
    return { errorCode: null, success: true };
  } catch (error) {
    return actionError(error);
  }
}

export async function resolveIssueAction(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const result = await resolveIssue({
      issueId: formString(form, "issueId"),
      resolution: formString(form, "resolution"),
      idempotencyKey: formString(form, "idempotencyKey"),
    });
    revalidatePath(`/app/products/${result.productId}`);
    return { errorCode: null, success: true };
  } catch (error) {
    return actionError(error);
  }
}
