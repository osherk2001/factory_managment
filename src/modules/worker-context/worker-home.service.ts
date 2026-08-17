import "server-only";

import { requirePermission } from "@/modules/authorization";

import { resolveEmployeeContext } from "./employee-context.service";
import { resolveWorkerProductionRoleState } from "./production-role-context.service";
import { listWorkerProductsForEmployee } from "./worker-products.service";
import type { WorkerHomeData } from "./worker-context.types";

export async function getWorkerHomeData(): Promise<WorkerHomeData> {
  const tenant = await requirePermission("products.read");
  const employee = await resolveEmployeeContext(tenant);
  const [productionRoleState, products] = await Promise.all([
    resolveWorkerProductionRoleState(employee),
    listWorkerProductsForEmployee(employee),
  ]);

  return { employee, productionRoleState, products };
}
