import "dotenv/config";

import { randomUUID } from "node:crypto";

import {
  AssignmentEndReason,
  Prisma,
  ProductStatus,
  ProductTransitionEventType,
  WeightEventType,
} from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "../../src/lib/db/client";

const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`;

let organizationA: { id: string };
let organizationB: { id: string };
let userA: { id: string };
let userB: { id: string };
let membershipA: { id: string };
let membershipB: { id: string };
let employeeA: { id: string };
let productionRoleA: { id: string };
let productA: { id: string };
let productB: { id: string };
let productC: { id: string };
const testUserIds: string[] = [];

async function cleanupOrganization(organizationId: string) {
  await prisma.$transaction([
    prisma.productTransition.deleteMany({ where: { organizationId } }),
    prisma.productAssignment.deleteMany({ where: { organizationId } }),
    prisma.issue.deleteMany({ where: { organizationId } }),
    prisma.weightEvent.deleteMany({ where: { organizationId } }),
    prisma.auditLog.deleteMany({ where: { organizationId } }),
    prisma.idempotencyKey.deleteMany({ where: { organizationId } }),
    prisma.product.updateMany({
      where: { organizationId },
      data: {
        currentWorkerId: null,
        currentRoleId: null,
        currentLocationId: null,
        currentStageId: null,
        productionOrderId: null,
        productTypeId: null,
      },
    }),
    prisma.workflowSnapshotStage.deleteMany({ where: { organizationId } }),
    prisma.workflowSnapshot.deleteMany({ where: { organizationId } }),
    prisma.workflowTemplateStage.deleteMany({ where: { organizationId } }),
    prisma.workflowTemplate.deleteMany({ where: { organizationId } }),
    prisma.barcode.deleteMany({ where: { organizationId } }),
    prisma.product.deleteMany({ where: { organizationId } }),
    prisma.productionOrder.deleteMany({ where: { organizationId } }),
    prisma.customer.deleteMany({ where: { organizationId } }),
    prisma.productType.deleteMany({ where: { organizationId } }),
    prisma.location.deleteMany({ where: { organizationId } }),
    prisma.department.deleteMany({ where: { organizationId } }),
    prisma.employeeProductionRole.deleteMany({ where: { organizationId } }),
    prisma.productionRole.deleteMany({ where: { organizationId } }),
    prisma.membershipAccessRole.deleteMany({ where: { organizationId } }),
    prisma.accessRolePermission.deleteMany({
      where: { accessRole: { organizationId } },
    }),
    prisma.accessRole.deleteMany({ where: { organizationId } }),
    prisma.employeeProfile.deleteMany({ where: { organizationId } }),
    prisma.membership.deleteMany({ where: { organizationId } }),
    prisma.organization.deleteMany({ where: { id: organizationId } }),
  ]);
}

describe.sequential("Phase 2 database model", () => {
  beforeAll(async () => {
    const staleOrganizations = await prisma.organization.findMany({
      where: { slug: { startsWith: "phase2-" } },
      select: { id: true },
    });
    const staleUsers = await prisma.user.findMany({
      where: { email: { startsWith: "phase2-" } },
      select: { id: true },
    });
    for (const staleOrganization of staleOrganizations) {
      await cleanupOrganization(staleOrganization.id);
    }
    if (staleUsers.length > 0) {
      await prisma.user.deleteMany({
        where: { id: { in: staleUsers.map((user) => user.id) } },
      });
    }

    organizationA = await prisma.organization.create({
      data: { name: `Test Factory A ${suffix}`, slug: `phase2-a-${suffix}` },
    });
    organizationB = await prisma.organization.create({
      data: { name: `Test Factory B ${suffix}`, slug: `phase2-b-${suffix}` },
    });

    userA = await prisma.user.create({
      data: { email: `phase2-a-${suffix}@example.test` },
    });
    userB = await prisma.user.create({
      data: { email: `phase2-b-${suffix}@example.test` },
    });

    membershipA = await prisma.membership.create({
      data: {
        organizationId: organizationA.id,
        userId: userA.id,
        status: "ACTIVE",
      },
    });
    membershipB = await prisma.membership.create({
      data: {
        organizationId: organizationB.id,
        userId: userB.id,
        status: "ACTIVE",
      },
    });

    employeeA = await prisma.employeeProfile.create({
      data: {
        organizationId: organizationA.id,
        membershipId: membershipA.id,
        displayName: `Phase 2 Worker ${suffix}`,
      },
    });

    productionRoleA = await prisma.productionRole.create({
      data: {
        organizationId: organizationA.id,
        code: `PHASE2-POLISHER-${suffix}`,
        name: "Phase 2 Polisher",
      },
    });

    productA = await prisma.product.create({
      data: {
        organizationId: organizationA.id,
        serialNumber: "PRD-001",
        status: ProductStatus.CREATED,
      },
    });
    productB = await prisma.product.create({
      data: {
        organizationId: organizationB.id,
        serialNumber: "PRD-001",
        status: ProductStatus.CREATED,
      },
    });
    productC = await prisma.product.create({
      data: {
        organizationId: organizationA.id,
        serialNumber: "PRD-002",
        status: ProductStatus.CREATED,
      },
    });
  });

  afterAll(async () => {
    if (organizationA?.id) {
      await cleanupOrganization(organizationA.id);
    }
    if (organizationB?.id) {
      await cleanupOrganization(organizationB.id);
    }
    await prisma.user.deleteMany({
      where: {
        id: {
          in: [userA?.id, userB?.id, ...testUserIds].filter(
            (id): id is string => Boolean(id),
          ),
        },
      },
    });
    await prisma.$disconnect();
  });

  it("allows the same serial in different organizations but rejects an in-tenant duplicate", async () => {
    expect(productA.id).not.toBe(productB.id);
    expect(
      await prisma.product.findMany({
        where: { serialNumber: "PRD-001" },
      }),
    ).toHaveLength(2);

    await expect(
      prisma.product.create({
        data: {
          organizationId: organizationA.id,
          serialNumber: "PRD-001",
          status: ProductStatus.CREATED,
        },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("enforces one active assignment per product", async () => {
    await prisma.productAssignment.create({
      data: {
        organizationId: organizationA.id,
        productId: productA.id,
        employeeId: employeeA.id,
        productionRoleId: productionRoleA.id,
      },
    });

    await expect(
      prisma.productAssignment.create({
        data: {
          organizationId: organizationA.id,
          productId: productA.id,
          employeeId: employeeA.id,
          productionRoleId: productionRoleA.id,
        },
      }),
    ).rejects.toMatchObject({ code: "P2002" });

    await prisma.productAssignment.updateMany({
      where: { productId: productA.id, endedAt: null },
      data: { endedAt: new Date(), endReason: AssignmentEndReason.FINISHED },
    });
  });

  it("enforces globally unique barcode values and one barcode per product", async () => {
    await prisma.barcode.create({
      data: {
        organizationId: organizationA.id,
        productId: productA.id,
        value: `barcode-${suffix}`,
      },
    });

    await expect(
      prisma.barcode.create({
        data: {
          organizationId: organizationB.id,
          productId: productB.id,
          value: `barcode-${suffix}`,
        },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("enforces membership, access role, and production role uniqueness", async () => {
    await expect(
      prisma.membership.create({
        data: {
          organizationId: organizationA.id,
          userId: userA.id,
          status: "ACTIVE",
        },
      }),
    ).rejects.toMatchObject({ code: "P2002" });

    const accessRoleCode = `PHASE2-WORKER-${suffix}`;
    await prisma.accessRole.createMany({
      data: [
        {
          organizationId: organizationA.id,
          code: accessRoleCode,
          name: "Worker A",
        },
        {
          organizationId: organizationB.id,
          code: accessRoleCode,
          name: "Worker B",
        },
      ],
    });
    await expect(
      prisma.accessRole.create({
        data: {
          organizationId: organizationA.id,
          code: accessRoleCode,
          name: "Duplicate",
        },
      }),
    ).rejects.toMatchObject({ code: "P2002" });

    const productionRoleCode = `PHASE2-CLEANER-${suffix}`;
    await prisma.productionRole.createMany({
      data: [
        {
          organizationId: organizationA.id,
          code: productionRoleCode,
          name: "Cleaner A",
        },
        {
          organizationId: organizationB.id,
          code: productionRoleCode,
          name: "Cleaner B",
        },
      ],
    });
    await expect(
      prisma.productionRole.create({
        data: {
          organizationId: organizationA.id,
          code: productionRoleCode,
          name: "Duplicate",
        },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("preserves decimal weight precision", async () => {
    const weight = await prisma.weightEvent.create({
      data: {
        organizationId: organizationA.id,
        productId: productA.id,
        recordedByUserId: userA.id,
        recordedByMembershipId: membershipA.id,
        type: WeightEventType.FINAL,
        grams: new Prisma.Decimal("12.345"),
      },
    });

    const storedWeight = await prisma.weightEvent.findUniqueOrThrow({
      where: { id: weight.id },
    });
    expect(storedWeight.grams.toFixed(3)).toBe("12.345");
  });

  it("rejects references to records from another or missing tenant context", async () => {
    const foreignOrder = await prisma.productionOrder.create({
      data: {
        organizationId: organizationB.id,
        orderNumber: `ORDER-${suffix}`,
        status: "OPEN",
      },
    });

    await expect(
      prisma.product.create({
        data: {
          organizationId: organizationA.id,
          productionOrderId: foreignOrder.id,
          serialNumber: `PRD-INVALID-${suffix}`,
          status: ProductStatus.CREATED,
        },
      }),
    ).rejects.toMatchObject({ code: "P2003" });

    await prisma.productionOrder.delete({ where: { id: foreignOrder.id } });

    await expect(
      prisma.product.create({
        data: {
          organizationId: organizationA.id,
          productionOrderId: randomUUID(),
          serialNumber: `PRD-MISSING-${suffix}`,
          status: ProductStatus.CREATED,
        },
      }),
    ).rejects.toMatchObject({ code: "P2003" });
  });

  it("keeps repeated workflow visits as separate append-only transitions", async () => {
    const template = await prisma.workflowTemplate.create({
      data: {
        organizationId: organizationA.id,
        name: `Phase 2 Workflow ${suffix}`,
        version: 1,
      },
    });
    const templateStage = await prisma.workflowTemplateStage.create({
      data: {
        organizationId: organizationA.id,
        workflowTemplateId: template.id,
        productionRoleId: productionRoleA.id,
        code: "POLISHING",
        name: "Polishing",
        position: 1,
      },
    });
    const snapshot = await prisma.workflowSnapshot.create({
      data: {
        organizationId: organizationA.id,
        productId: productA.id,
        sourceTemplateId: template.id,
        sourceVersion: template.version,
      },
    });
    const snapshotStage = await prisma.workflowSnapshotStage.create({
      data: {
        organizationId: organizationA.id,
        workflowSnapshotId: snapshot.id,
        productId: productA.id,
        productionRoleId: productionRoleA.id,
        sourceStageId: templateStage.id,
        code: "POLISHING",
        name: "Polishing",
        position: 1,
      },
    });
    const otherSnapshot = await prisma.workflowSnapshot.create({
      data: {
        organizationId: organizationA.id,
        productId: productC.id,
        sourceTemplateId: template.id,
        sourceVersion: template.version,
      },
    });
    const otherSnapshotStage = await prisma.workflowSnapshotStage.create({
      data: {
        organizationId: organizationA.id,
        workflowSnapshotId: otherSnapshot.id,
        productId: productC.id,
        productionRoleId: productionRoleA.id,
        sourceStageId: templateStage.id,
        code: "POLISHING",
        name: "Polishing",
        position: 1,
      },
    });

    await expect(
      prisma.product.update({
        where: { id: productA.id },
        data: { currentStageId: otherSnapshotStage.id },
      }),
    ).rejects.toMatchObject({ code: "P2003" });

    await expect(
      prisma.productAssignment.create({
        data: {
          organizationId: organizationA.id,
          productId: productA.id,
          employeeId: employeeA.id,
          productionRoleId: productionRoleA.id,
          workflowStageId: otherSnapshotStage.id,
        },
      }),
    ).rejects.toMatchObject({ code: "P2003" });

    await expect(
      prisma.productTransition.create({
        data: {
          organizationId: organizationA.id,
          productId: productA.id,
          actorUserId: userA.id,
          actorMembershipId: membershipA.id,
          eventType: ProductTransitionEventType.MANUAL_TRANSFER,
          toStageId: otherSnapshotStage.id,
        },
      }),
    ).rejects.toMatchObject({ code: "P2003" });

    await prisma.productTransition.create({
      data: {
        organizationId: organizationA.id,
        productId: productA.id,
        actorUserId: userA.id,
        actorMembershipId: membershipA.id,
        eventType: ProductTransitionEventType.PRODUCT_RECEIVED,
        toStatus: ProductStatus.IN_PROGRESS,
        toStageId: snapshotStage.id,
        metadata: { visit: 1 },
      },
    });
    await prisma.productTransition.create({
      data: {
        organizationId: organizationA.id,
        productId: productA.id,
        actorUserId: userA.id,
        actorMembershipId: membershipA.id,
        eventType: ProductTransitionEventType.MANUAL_TRANSFER,
        fromStatus: ProductStatus.IN_PROGRESS,
        toStatus: ProductStatus.IN_PROGRESS,
        fromStageId: snapshotStage.id,
        toStageId: snapshotStage.id,
        reason: "Rework visit",
        metadata: { visit: 2 },
      },
    });

    const transitions = await prisma.productTransition.findMany({
      where: { productId: productA.id },
      orderBy: { createdAt: "asc" },
    });
    expect(transitions).toHaveLength(2);
    expect(new Set(transitions.map((transition) => transition.id)).size).toBe(
      2,
    );
    expect(transitions[1]?.toStageId).toBe(snapshotStage.id);
  });

  it("enforces System Admin defaults, explicit elevation, and User identity uniqueness", async () => {
    const defaultUser = await prisma.user.create({
      data: { email: `hardening-default-${suffix}@example.test` },
    });
    const systemAdmin = await prisma.user.create({
      data: {
        email: `hardening-admin-${suffix}@example.test`,
        username: `hardening-admin-${suffix}`,
        isSystemAdmin: true,
      },
    });
    testUserIds.push(defaultUser.id, systemAdmin.id);

    expect(defaultUser.isSystemAdmin).toBe(false);
    expect(systemAdmin.isSystemAdmin).toBe(true);

    const duplicateEmailUser = await prisma.user.create({
      data: { email: `hardening-email-${suffix}@example.test` },
    });
    testUserIds.push(duplicateEmailUser.id);
    await expect(
      prisma.user.create({
        data: { email: duplicateEmailUser.email },
      }),
    ).rejects.toMatchObject({ code: "P2002" });

    const duplicateUsernameUser = await prisma.user.create({
      data: { username: `hardening-username-${suffix}` },
    });
    testUserIds.push(duplicateUsernameUser.id);
    await expect(
      prisma.user.create({
        data: { username: duplicateUsernameUser.username },
      }),
    ).rejects.toMatchObject({ code: "P2002" });

    const nullIdentityUserA = await prisma.user.create({ data: {} });
    const nullIdentityUserB = await prisma.user.create({ data: {} });
    testUserIds.push(nullIdentityUserA.id, nullIdentityUserB.id);
    expect(nullIdentityUserA.email).toBeNull();
    expect(nullIdentityUserB.email).toBeNull();
    expect(nullIdentityUserA.username).toBeNull();
    expect(nullIdentityUserB.username).toBeNull();
  });

  it("requires tenant actor membership context for business history", async () => {
    await expect(
      prisma.productTransition.create({
        data: {
          organizationId: organizationA.id,
          productId: productA.id,
          actorUserId: userB.id,
          actorMembershipId: membershipB.id,
          eventType: ProductTransitionEventType.MANUAL_TRANSFER,
        },
      }),
    ).rejects.toMatchObject({ code: "P2003" });

    const validTransition = await prisma.productTransition.create({
      data: {
        organizationId: organizationA.id,
        productId: productA.id,
        actorUserId: userA.id,
        actorMembershipId: membershipA.id,
        eventType: ProductTransitionEventType.MANUAL_TRANSFER,
      },
    });
    expect(validTransition.actorMembershipId).toBe(membershipA.id);

    await expect(
      prisma.issue.create({
        data: {
          organizationId: organizationA.id,
          productId: productA.id,
          reportedByUserId: userB.id,
          reportedByMembershipId: membershipB.id,
          type: "HARDENING_TEST",
          status: "OPEN",
        },
      }),
    ).rejects.toMatchObject({ code: "P2003" });

    await expect(
      prisma.weightEvent.create({
        data: {
          organizationId: organizationA.id,
          productId: productA.id,
          recordedByUserId: userB.id,
          recordedByMembershipId: membershipB.id,
          type: WeightEventType.FINAL,
          grams: new Prisma.Decimal("1.000"),
        },
      }),
    ).rejects.toMatchObject({ code: "P2003" });

    await expect(
      prisma.idempotencyKey.create({
        data: {
          organizationId: organizationA.id,
          userId: userB.id,
          actorMembershipId: membershipB.id,
          key: `hardening-${suffix}`,
          operation: "hardening-test",
        },
      }),
    ).rejects.toMatchObject({ code: "P2003" });

    await expect(
      prisma.auditLog.create({
        data: {
          organizationId: organizationA.id,
          actorUserId: userB.id,
          actorMembershipId: membershipB.id,
          action: "HARDENING_TEST",
          targetType: "Product",
          targetId: productA.id,
        },
      }),
    ).rejects.toMatchObject({ code: "P2003" });

    const platformAudit = await prisma.auditLog.create({
      data: {
        organizationId: null,
        actorUserId: userB.id,
        action: "HARDENING_PLATFORM_TEST",
        targetType: "Organization",
      },
    });
    expect(platformAudit.actorMembershipId).toBeNull();
    await prisma.auditLog.delete({ where: { id: platformAudit.id } });
  });
});
