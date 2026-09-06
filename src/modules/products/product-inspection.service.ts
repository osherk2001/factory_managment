import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import {
  requirePermission,
  getPermissionsForMembership,
} from "@/modules/authorization";
import { listProductIssues } from "@/modules/issues/issue.service";
import { getProductWeightHistory } from "@/modules/weights/weight.service";
import { ApplicationError } from "@/shared/errors";

export async function inspectProduct(productId: string, historyPage = 1) {
  const context = await requirePermission("products.read");
  if (!z.string().uuid().safeParse(productId).success)
    throw new ApplicationError("NOT_FOUND", "Product unavailable");
  const permissions = await getPermissionsForMembership(context);
  const scope = { organizationId: context.organizationId, productId };
  const page =
    Number.isSafeInteger(historyPage) &&
    historyPage > 0 &&
    historyPage <= 100000
      ? historyPage
      : 1;
  const [
    product,
    transitions,
    assignments,
    transitionCount,
    assignmentCount,
    issues,
    weights,
  ] = await Promise.all([
    prisma.product.findFirst({
      where: { id: productId, organizationId: context.organizationId },
      select: {
        id: true,
        serialNumber: true,
        createdAt: true,
        targetAt: true,
        isUrgent: true,
        version: true,
        status: true,
        productType: { select: { name: true } },
        productionOrder: {
          select: { orderNumber: true, customer: { select: { name: true } } },
        },
        barcode: { select: { lastPrintedAt: true } },
      },
    }),
    prisma.productTransition.findMany({
      where: scope,
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * 50,
      take: 50,
      select: {
        id: true,
        eventType: true,
        occurredAt: true,
        reason: true,
        fromStatus: true,
        toStatus: true,
        actorUser: { select: { username: true } },
        fromWorker: { select: { displayName: true } },
        toWorker: { select: { displayName: true } },
        fromRole: { select: { name: true } },
        toRole: { select: { name: true } },
        fromLocation: { select: { name: true } },
        toLocation: { select: { name: true } },
      },
    }),
    prisma.productAssignment.findMany({
      where: scope,
      orderBy: [{ startedAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * 50,
      take: 50,
      select: {
        id: true,
        startedAt: true,
        endedAt: true,
        employee: { select: { displayName: true } },
        productionRole: { select: { name: true } },
        location: { select: { name: true } },
      },
    }),
    prisma.productTransition.count({ where: scope }),
    prisma.productAssignment.count({ where: scope }),
    permissions.has("issues.read") ? listProductIssues(productId) : null,
    permissions.has("weights.read") ? getProductWeightHistory(productId) : null,
  ]);
  if (!product) throw new ApplicationError("NOT_FOUND", "Product unavailable");
  const locations = permissions.has("locations.transfer")
    ? await prisma.location.findMany({
        where: { organizationId: context.organizationId, isActive: true },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      })
    : [];
  return {
    product: {
      id: product.id,
      serialNumber: product.serialNumber,
      createdAt: product.createdAt.toISOString(),
      targetAt: product.targetAt?.toISOString() ?? null,
      isUrgent: product.isUrgent,
      version: product.version,
      status: product.status,
      productType: product.productType?.name ?? null,
      order: product.productionOrder?.orderNumber ?? null,
      customer: product.productionOrder?.customer?.name ?? null,
      printed: Boolean(product.barcode?.lastPrintedAt),
    },
    transitions: transitions.map((t) => ({
      id: t.id,
      eventType: t.eventType,
      occurredAt: t.occurredAt.toISOString(),
      reason: t.reason,
      actor: t.actorUser.username,
      fromStatus: t.fromStatus,
      toStatus: t.toStatus,
      fromWorker: t.fromWorker?.displayName ?? null,
      toWorker: t.toWorker?.displayName ?? null,
      fromRole: t.fromRole?.name ?? null,
      toRole: t.toRole?.name ?? null,
      fromLocation: t.fromLocation?.name ?? null,
      toLocation: t.toLocation?.name ?? null,
    })),
    assignments: assignments.map((a) => ({
      id: a.id,
      startedAt: a.startedAt.toISOString(),
      endedAt: a.endedAt?.toISOString() ?? null,
      worker: a.employee.displayName,
      role: a.productionRole.name,
      location: a.location?.name ?? null,
    })),
    page,
    hasMore: Math.max(transitionCount, assignmentCount) > page * 50,
    issues,
    weights,
    locations,
    capabilities: {
      createIssue: permissions.has("issues.create"),
      resolveIssue: permissions.has("issues.resolve"),
      recordWeight: permissions.has("weights.create"),
      correctWeight: permissions.has("weights.correct"),
      print: permissions.has(
        product.barcode?.lastPrintedAt ? "barcodes.reprint" : "barcodes.print",
      ),
      update: permissions.has("products.update"),
      transfer: permissions.has("locations.transfer"),
    },
  };
}
