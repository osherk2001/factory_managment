import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/client";
import { requirePermission, getPermissionsForMembership } from "@/modules/authorization";
import { ApplicationError } from "@/shared/errors";
import { parseProductFilters, type ProductFilters } from "./product-filters";

export function productWhere(organizationId: string, filters: ProductFilters, now = new Date()): Prisma.ProductWhereInput {
  const active: Prisma.EnumProductStatusFilter = { in: ["CREATED", "IN_PROGRESS", "READY_FOR_HANDOFF"] };
  return {
    organizationId, status: filters.status ?? { not: "TRASHED" },
    ...(filters.q ? { OR: [
      { serialNumber: { contains: filters.q, mode: "insensitive" } },
      { barcode: { value: filters.q } },
      { productionOrder: { orderNumber: { contains: filters.q, mode: "insensitive" } } },
      { productionOrder: { customer: { name: { contains: filters.q, mode: "insensitive" } } } },
    ] } : {}),
    ...(filters.urgent ? { isUrgent: true } : {}),
    ...(filters.delayed ? { AND: [{ status: active }, { targetAt: { lt: now } }] } : {}),
    ...(filters.issues ? { issues: { some: { organizationId, status: "OPEN" } } } : {}),
    ...(filters.workerId ? { currentWorkerId: filters.workerId } : {}),
    ...(filters.roleId ? { currentRoleId: filters.roleId } : {}),
    ...(filters.locationId ? { currentLocationId: filters.locationId } : {}),
    ...(filters.from || filters.to ? { createdAt: {
      ...(filters.from ? { gte: new Date(filters.from + "T00:00:00.000Z") } : {}),
      ...(filters.to ? { lt: new Date(new Date(filters.to + "T00:00:00.000Z").getTime() + 86400000) } : {}),
    } } : {}),
  };
}

export async function listOperationalProducts(input: unknown) {
  const context = await requirePermission("products.read");
  const filters = parseProductFilters(input);
  const permissions = await getPermissionsForMembership(context);
  if (filters.issues && !permissions.has("issues.read")) throw new ApplicationError("FORBIDDEN", "Issue access required");
  const where = productWhere(context.organizationId, filters);
  const [products, total, workers, roles, locations] = await prisma.$transaction([
    prisma.product.findMany({ where, orderBy: [{ isUrgent: "desc" }, { targetAt: { sort: "asc", nulls: "last" } }, { id: "asc" }], skip: (filters.page - 1) * 30, take: 30,
      select: { id: true, serialNumber: true, status: true, isUrgent: true, targetAt: true,
        currentWorker: { select: { displayName: true } }, currentRole: { select: { name: true } }, currentLocation: { select: { name: true } },
        productionOrder: { select: { orderNumber: true, customer: { select: { name: true } } } },
        _count: { select: { issues: { where: { organizationId: context.organizationId, status: "OPEN" } } } },
      } }),
    prisma.product.count({ where }),
    prisma.employeeProfile.findMany({ where: { organizationId: context.organizationId }, select: { id: true, displayName: true }, orderBy: { displayName: "asc" } }),
    prisma.productionRole.findMany({ where: { organizationId: context.organizationId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.location.findMany({ where: { organizationId: context.organizationId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ], { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  return {
    filters, total, workers: workers.map(w => ({ id: w.id, name: w.displayName })), roles, locations,
    canReadIssues: permissions.has("issues.read"), canExport: permissions.has("reports.export"), canCreate: permissions.has("products.create"),
    products: products.map(p => ({ id: p.id, serialNumber: p.serialNumber, status: p.status, isUrgent: p.isUrgent, targetAt: p.targetAt?.toISOString() ?? null,
      delayed: Boolean(p.targetAt && p.targetAt < new Date() && ["CREATED", "IN_PROGRESS", "READY_FOR_HANDOFF"].includes(p.status)),
      worker: p.currentWorker?.displayName ?? null, role: p.currentRole?.name ?? null, location: p.currentLocation?.name ?? null,
      order: p.productionOrder?.orderNumber ?? null, customer: p.productionOrder?.customer?.name ?? null,
      openIssues: permissions.has("issues.read") ? p._count.issues : null,
    })),
  };
}

export async function getOperationalDashboard() {
  const context = await requirePermission("products.read");
  const permissions = await getPermissionsForMembership(context);
  const scope = { organizationId: context.organizationId };
  const active = { ...scope, status: { in: ["CREATED", "IN_PROGRESS", "READY_FOR_HANDOFF"] as const } };
  const activeWhere: Prisma.ProductWhereInput = { ...active, status: { in: [...active.status.in] } };
  const counts = await prisma.product.groupBy({ by: ["status"], orderBy: { status: "asc" }, where: { ...scope, status: { not: "TRASHED" } }, _count: { _all: true } });
  const [urgent, delayed, issues] = await prisma.$transaction([
    prisma.product.count({ where: { ...activeWhere, isUrgent: true } }),
    prisma.product.count({ where: { ...activeWhere, targetAt: { lt: new Date() } } }),
    prisma.issue.count({ where: { ...scope, status: "OPEN", product: { status: { not: "TRASHED" } } } }),
  ]);
  return { counts: counts.map(c => ({ status: c.status, count: c._count._all })), urgent, delayed, issues: permissions.has("issues.read") ? issues : null };
}
