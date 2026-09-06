"use server";
import { revalidatePath } from "next/cache";
import { correctWeightEvent, recordWeightEvent } from "./weight.service";
import type { WeightEventType } from "./weight-types";
import { formString, type ActionState } from "@/shared/actions/action-state";
import { actionError } from "@/shared/actions/action-error";

export async function recordWeightAction(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const result = await recordWeightEvent({
      productId: formString(form, "productId"),
      type: formString(form, "type") as Exclude<WeightEventType, "CORRECTION">,
      grams: formString(form, "grams"),
      note: formString(form, "note"),
      idempotencyKey: formString(form, "idempotencyKey"),
    });
    revalidatePath(`/app/products/${result.productId}`);
    return { errorCode: null, success: true };
  } catch (error) {
    return actionError(error);
  }
}
export async function correctWeightAction(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const result = await correctWeightEvent({
      productId: formString(form, "productId"),
      correctsWeightEventId: formString(form, "correctsWeightEventId"),
      grams: formString(form, "grams"),
      note: formString(form, "note"),
      idempotencyKey: formString(form, "idempotencyKey"),
    });
    revalidatePath(`/app/products/${result.productId}`);
    return { errorCode: null, success: true };
  } catch (error) {
    return actionError(error);
  }
}
