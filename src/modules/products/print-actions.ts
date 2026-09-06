"use server";
import QRCode from "qrcode";
import { prepareBarcodePrint } from "./barcode-print.service";
import { actionError } from "@/shared/actions/action-error";
import { formString } from "@/shared/actions/action-state";
export async function preparePrintAction(
  _previous: {
    errorCode: string | null;
    label: { image: string; serial: string } | null;
  },
  form: FormData,
) {
  try {
    const label = await prepareBarcodePrint({
      productId: formString(form, "productId"),
      reprint: formString(form, "reprint") === "true",
      idempotencyKey: formString(form, "idempotencyKey"),
    });
    return {
      errorCode: null,
      label: {
        image: await QRCode.toDataURL(label.barcode, {
          errorCorrectionLevel: "M",
          margin: 4,
          width: 320,
        }),
        serial: label.serialNumber,
      },
    };
  } catch (error) {
    return { errorCode: actionError(error).errorCode, label: null };
  }
}
