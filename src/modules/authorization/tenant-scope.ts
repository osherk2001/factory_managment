import type { TenantContext } from "./authorization.types";

export function tenantWhere<T extends Record<string, unknown>>(
  context: TenantContext,
  where: T,
): T & { organizationId: string } {
  return { ...where, organizationId: context.organizationId };
}
