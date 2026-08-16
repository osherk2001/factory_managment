"use server";

import { isFactoryFlowAuthError } from "@/modules/auth/auth-errors";
import { createProduct, isProductCreationError } from "@/modules/products";

import type { ProductCreationActionState } from "./product-action-types";

function getFormValue(formData: FormData, name: string): string | undefined {
  const value = formData.get(name);
  return typeof value === "string" ? value : undefined;
}

export async function createProductAction(
  _previousState: ProductCreationActionState,
  formData: FormData,
): Promise<ProductCreationActionState> {
  try {
    const product = await createProduct({
      productionOrderId: getFormValue(formData, "productionOrderId") || null,
      productTypeId: getFormValue(formData, "productTypeId") || null,
      isUrgent: getFormValue(formData, "isUrgent") === "on",
      targetAt: getFormValue(formData, "targetAt") || null,
      idempotencyKey: getFormValue(formData, "idempotencyKey") ?? "",
    });

    return { product, errorCode: null };
  } catch (error) {
    if (isProductCreationError(error)) {
      return { product: null, errorCode: error.code };
    }

    if (isFactoryFlowAuthError(error)) {
      return { product: null, errorCode: "UNAUTHORIZED" };
    }

    return { product: null, errorCode: "PRODUCT_CREATION_FAILED" };
  }
}
