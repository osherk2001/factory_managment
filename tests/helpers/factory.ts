import { randomUUID } from "node:crypto";
import { prisma } from "../../src/lib/db/client";
import { PERMISSION_CODES } from "../../src/modules/authorization/permissions";
export async function makeFactory(label: string) {
  return prisma.organization.create({
    data: { name: label, slug: "test-" + randomUUID() },
    select: { id: true },
  });
}
export async function makeActor(
  organizationId: string,
  permissions: readonly string[] = PERMISSION_CODES,
) {
  const user = await prisma.user.create({
    data: { username: "actor-" + randomUUID() },
    select: { id: true, username: true },
  });
  const membership = await prisma.membership.create({
    data: { organizationId, userId: user.id, status: "ACTIVE" },
    select: { id: true },
  });
  const role = await prisma.accessRole.create({
    data: {
      organizationId,
      code: "role-" + randomUUID(),
      name: "Test permissions",
    },
    select: { id: true },
  });
  await prisma.permission.createMany({
    data: permissions.map((code) => ({ code })),
    skipDuplicates: true,
  });
  const catalog = await prisma.permission.findMany({
    where: { code: { in: [...permissions] } },
    select: { id: true },
  });
  await prisma.accessRolePermission.createMany({
    data: catalog.map((p) => ({ accessRoleId: role.id, permissionId: p.id })),
  });
  await prisma.membershipAccessRole.create({
    data: {
      organizationId,
      membershipId: membership.id,
      accessRoleId: role.id,
    },
  });
  return { user, membership, role };
}
export async function cleanupFactory(organizationId: string) {
  const users = await prisma.membership.findMany({
    where: { organizationId },
    select: { userId: true },
  });
  const where = { organizationId };
  await prisma.$transaction([
    prisma.productTransition.deleteMany({ where }),
    prisma.productAssignment.deleteMany({ where }),
    prisma.weightEvent.deleteMany({ where: { ...where, type: "CORRECTION" } }),
    prisma.weightEvent.deleteMany({ where }),
    prisma.issue.deleteMany({ where }),
    prisma.auditLog.deleteMany({ where }),
    prisma.idempotencyKey.deleteMany({ where }),
    prisma.rateLimitBucket.deleteMany({ where }),
    prisma.barcode.deleteMany({ where }),
    prisma.product.deleteMany({ where }),
    prisma.productSerialCounter.deleteMany({ where }),
    prisma.productionOrder.deleteMany({ where }),
    prisma.customer.deleteMany({ where }),
    prisma.productType.deleteMany({ where }),
    prisma.workerProductionContext.deleteMany({ where }),
    prisma.employeeProductionRole.deleteMany({ where }),
    prisma.employeeProfile.deleteMany({ where }),
    prisma.location.deleteMany({ where }),
    prisma.department.deleteMany({ where }),
    prisma.productionRole.deleteMany({ where }),
    prisma.membershipAccessRole.deleteMany({ where }),
    prisma.accessRolePermission.deleteMany({ where: { accessRole: where } }),
    prisma.accessRole.deleteMany({ where }),
    prisma.membership.deleteMany({ where }),
    prisma.organization.delete({ where: { id: organizationId } }),
    prisma.user.deleteMany({
      where: {
        id: { in: users.map((u) => u.userId) },
        memberships: { none: {} },
      },
    }),
  ]);
}
