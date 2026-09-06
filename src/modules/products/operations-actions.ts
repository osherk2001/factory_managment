"use server";
import { revalidatePath } from "next/cache";
import { updateProductOperations } from "./product-operations.service";
import { formString, type ActionState } from "@/shared/actions/action-state";
import { actionError } from "@/shared/actions/action-error";
export async function productOperationsAction(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const get = (name: string) => formString(form, name);
    const target = get("targetAt");
    const result = await updateProductOperations({
      operation: get("operation"),
      productId: get("productId"),
      expectedVersion: Number(get("expectedVersion")),
      idempotencyKey: get("idempotencyKey"),
      isUrgent: get("isUrgent") === "true",
      targetAt: target ? target + "T00:00:00.000Z" : null,
      locationId: get("locationId"),
      reason: get("reason"),
    });
    revalidatePath(`/app/products/${result.productId}`);
    return { errorCode: null, success: true };
  } catch (error) {
    return actionError(error);
  }
}
