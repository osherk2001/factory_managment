import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/client";
import {
  requirePermission,
  getPermissionsForMembership,
} from "@/modules/authorization";
import { ApplicationError } from "@/shared/errors";
import { getMessages, type Locale } from "@/lib/i18n";
import { parseProductFilters } from "./product-filters";
import { productWhere } from "./operations.service";
import { toCsv } from "./csv";

export async function exportProductReport(
  kind: "operational" | "material",
  input: unknown,
  locale: Locale = "he",
) {
  if (kind !== "operational" && kind !== "material")
    throw new ApplicationError("INVALID_INPUT", "Invalid report type");
  const context = await requirePermission("reports.export");
  const permissions = await getPermissionsForMembership(context);
  if (
    !permissions.has("products.read") ||
    (kind === "material" && !permissions.has("weights.read"))
  )
    throw new ApplicationError("FORBIDDEN", "Report access required");
  const filters = parseProductFilters(input);
  if (filters.issues && !permissions.has("issues.read"))
    throw new ApplicationError("FORBIDDEN", "Issue access required");
  const m = getMessages(locale);
  const o = m.operations;
  return prisma.$transaction(
    async (database) => {
      const products = await database.product.findMany({
        where: productWhere(context.organizationId, filters),
        take: 10001,
        orderBy: { serialNumber: "asc" },
        select: {
          id: true,
          serialNumber: true,
          status: true,
          targetAt: true,
          isUrgent: true,
          currentWorker: { select: { displayName: true } },
          currentRole: { select: { name: true } },
          currentLocation: { select: { name: true } },
          productionOrder: {
            select: { orderNumber: true, customer: { select: { name: true } } },
          },
        },
      });
      if (products.length > 10000)
        throw new ApplicationError("REPORT_TOO_LARGE", "Narrow report filters");
      const rows: unknown[][] = [];
      if (kind === "operational") {
        rows.push([
          o.serial,
          o.status,
          o.worker,
          o.role,
          o.location,
          o.order,
          o.customer,
          o.target,
          o.urgent,
        ]);
        for (const p of products)
          rows.push([
            p.serialNumber,
            m.products.statusValues[p.status],
            p.currentWorker?.displayName,
            p.currentRole?.name,
            p.currentLocation?.name,
            p.productionOrder?.orderNumber,
            p.productionOrder?.customer?.name,
            p.targetAt?.toISOString(),
            p.isUrgent,
          ]);
      } else {
        rows.push([
          o.serial,
          o.order,
          o.expected,
          o.issued,
          o.final,
          o.returned,
          o.approvedLoss,
          o.materialVariance,
        ]);
        const sums = await database.weightEvent.groupBy({
          by: ["productId", "type", "correctsWeightEventId"],
          where: {
            organizationId: context.organizationId,
            productId: { in: products.map((p) => p.id) },
          },
          _sum: { grams: true },
        });
        const targets = await database.weightEvent.findMany({
          where: {
            organizationId: context.organizationId,
            id: {
              in: sums.flatMap((s) =>
                s.correctsWeightEventId ? [s.correctsWeightEventId] : [],
              ),
            },
          },
          select: { id: true, type: true },
        });
        const types = new Map(targets.map((t) => [t.id, t.type]));
        const totals = new Map<string, Record<string, Prisma.Decimal>>();
        for (const sum of sums) {
          const type =
            sum.type === "CORRECTION" && sum.correctsWeightEventId
              ? types.get(sum.correctsWeightEventId)
              : sum.type;
          if (!type || type === "CORRECTION") continue;
          const total = totals.get(sum.productId) ?? {};
          total[type] = (total[type] ?? new Prisma.Decimal(0)).plus(
            sum._sum.grams ?? 0,
          );
          totals.set(sum.productId, total);
        }
        for (const p of products) {
          const t = totals.get(p.id) ?? {};
          const amount = (type: string) => t[type] ?? new Prisma.Decimal(0);
          rows.push([
            p.serialNumber,
            p.productionOrder?.orderNumber,
            ...["EXPECTED", "ISSUED", "FINAL", "RETURNED", "APPROVED_LOSS"].map(
              (t) => amount(t).toFixed(3),
            ),
            amount("ISSUED")
              .minus(amount("FINAL"))
              .minus(amount("RETURNED"))
              .minus(amount("APPROVED_LOSS"))
              .toFixed(3),
          ]);
        }
      }
      await database.auditLog.create({
        data: {
          organizationId: context.organizationId,
          actorUserId: context.userId,
          actorMembershipId: context.membershipId,
          action: "report.exported",
          targetType: "Report",
          metadata: { kind, rowCount: products.length, filters },
        },
      });
      return toCsv(rows);
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
      timeout: 30000,
    },
  );
}
