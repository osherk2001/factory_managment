import { z } from "zod";
import { ApplicationError } from "@/shared/errors";

export const productFilterSchema = z
  .object({
    q: z.string().trim().max(200).default(""),
    status: z
      .enum([
        "CREATED",
        "IN_PROGRESS",
        "READY_FOR_HANDOFF",
        "COMPLETED",
        "CANCELLED",
      ])
      .optional(),
    urgent: z.enum(["true"]).optional(),
    delayed: z.enum(["true"]).optional(),
    issues: z.enum(["true"]).optional(),
    workerId: z.string().uuid().optional(),
    roleId: z.string().uuid().optional(),
    locationId: z.string().uuid().optional(),
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
    page: z.coerce.number().int().min(1).max(100000).default(1),
  })
  .refine((v) => !v.from || !v.to || v.from <= v.to);
export type ProductFilters = z.infer<typeof productFilterSchema>;
export function parseProductFilters(input: unknown): ProductFilters {
  const parsed = productFilterSchema.safeParse(input);
  if (!parsed.success)
    throw new ApplicationError("INVALID_INPUT", "Invalid product filters");
  return parsed.data;
}
export function cleanSearchParams(
  input: Record<string, string | string[] | undefined>,
) {
  return Object.fromEntries(
    Object.entries(input).filter(([, v]) => v !== "" && v !== undefined),
  );
}
