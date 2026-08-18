import "dotenv/config";

import { randomUUID } from "node:crypto";

import type { Session } from "next-auth";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("../../src/auth", () => ({ auth: vi.fn() }));

import { auth } from "../../src/auth";
import { prisma } from "../../src/lib/db/client";
import {
  completeProduct,
  createProduct,
  finishProduct,
  returnCompletedProductToProcess,
} from "../../src/modules/products/server";
import {
  scanProduct,
  takeOverProduct,
} from "../../src/modules/scanning/server";
import {
  createWorkflowTemplate,
  createWorkflowTemplateVersion,
  resolveWorkflowStageForRole,
  setWorkflowTemplateActive,
  WORKFLOW_ERROR_CODES,
} from "../../src/modules/workflows/server";
import type {
  WorkflowTemplateDto,
  WorkflowTemplateStageInput,
} from "../../src/modules/workflows";

const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`;
const authMock = auth as unknown as {
  mockResolvedValue: (value: Session | null) => void;
};

type Actor = {
  user: { id: string; username: string };
  membership: { id: string };
  employee: { id: string } | null;
};

let organizationA: { id: string };
let organizationB: { id: string };
let manager: Actor;
let workerA: Actor;
let workerB: Actor;
let roleA: { id: string };
let roleB: { id: string };
let roleC: { id: string };
let unmappedRole: { id: string };
let foreignRole: { id: string };
let location: { id: string };
let linearTemplate: WorkflowTemplateDto;
let workflowProduct: Awaited<ReturnType<typeof createProduct>>;

function setSession(actor: Actor) {
  authMock.mockResolvedValue({
    user: {
      id: actor.user.id,
      username: actor.user.username,
      name: actor.user.username,
    },
    expires: new Date(Date.now() + 60_000).toISOString(),
  });
}

async function permission(code: string) {
  return prisma.permission.upsert({
    where: { code },
    update: {},
    create: { code, description: `Phase 9 ${code}` },
    select: { id: true },
  });
}

async function createActor(
  name: string,
  permissionCodes: readonly string[],
  employee: boolean,
): Promise<Actor> {
  const user = await prisma.user.create({
    data: { username: `phase9-${name}-${suffix}` },
    select: { id: true, username: true },
  });
  if (!user.username) throw new Error("Phase 9 user requires a username");
  const membership = await prisma.membership.create({
    data: {
      organizationId: organizationA.id,
      userId: user.id,
      status: "ACTIVE",
    },
    select: { id: true },
  });
  const employeeProfile = employee
    ? await prisma.employeeProfile.create({
        data: {
          organizationId: organizationA.id,
          membershipId: membership.id,
          displayName: `Phase 9 ${name}`,
        },
        select: { id: true },
      })
    : null;
  const accessRole = await prisma.accessRole.create({
    data: {
      organizationId: organizationA.id,
      code: `PHASE9_${name.toUpperCase()}_${suffix}`,
      name: `Phase 9 ${name}`,
    },
    select: { id: true },
  });
  for (const code of permissionCodes) {
    const permissionRecord = await permission(code);
    await prisma.accessRolePermission.create({
      data: { accessRoleId: accessRole.id, permissionId: permissionRecord.id },
    });
  }
  await prisma.membershipAccessRole.create({
    data: {
      organizationId: organizationA.id,
      membershipId: membership.id,
      accessRoleId: accessRole.id,
    },
  });

  return {
    user: { id: user.id, username: user.username },
    membership,
    employee: employeeProfile,
  };
}

function linearStages(): readonly WorkflowTemplateStageInput[] {
  return [
    { code: "START", name: "Start", position: 1, productionRoleId: roleA.id },
    { code: "MIDDLE", name: "Middle", position: 2, productionRoleId: roleB.id },
    { code: "FINAL", name: "Final", position: 3, productionRoleId: roleC.id },
  ];
}

async function setActiveRole(actor: Actor, productionRoleId: string) {
  if (!actor.employee) throw new Error("Employee required");
  await prisma.workerProductionContext.upsert({
    where: {
      organizationId_employeeId: {
        organizationId: organizationA.id,
        employeeId: actor.employee.id,
      },
    },
    create: {
      organizationId: organizationA.id,
      employeeId: actor.employee.id,
      activeProductionRoleId: productionRoleId,
    },
    update: { activeProductionRoleId: productionRoleId },
  });
}

beforeAll(async () => {
  [organizationA, organizationB] = await Promise.all([
    prisma.organization.create({
      data: { name: `Phase 9 A ${suffix}`, slug: `phase9-a-${suffix}` },
      select: { id: true },
    }),
    prisma.organization.create({
      data: { name: `Phase 9 B ${suffix}`, slug: `phase9-b-${suffix}` },
      select: { id: true },
    }),
  ]);

  [roleA, roleB, roleC, unmappedRole, foreignRole] = await Promise.all([
    prisma.productionRole.create({
      data: {
        organizationId: organizationA.id,
        code: `A-${suffix}`,
        name: "Role A",
      },
      select: { id: true },
    }),
    prisma.productionRole.create({
      data: {
        organizationId: organizationA.id,
        code: `B-${suffix}`,
        name: "Role B",
      },
      select: { id: true },
    }),
    prisma.productionRole.create({
      data: {
        organizationId: organizationA.id,
        code: `C-${suffix}`,
        name: "Role C",
      },
      select: { id: true },
    }),
    prisma.productionRole.create({
      data: {
        organizationId: organizationA.id,
        code: `U-${suffix}`,
        name: "Unmapped",
      },
      select: { id: true },
    }),
    prisma.productionRole.create({
      data: {
        organizationId: organizationB.id,
        code: `F-${suffix}`,
        name: "Foreign",
      },
      select: { id: true },
    }),
  ]);
  location = await prisma.location.create({
    data: {
      organizationId: organizationA.id,
      code: `WORK-${suffix}`,
      name: "Phase 9 Work Area",
      type: "WORK_AREA",
    },
    select: { id: true },
  });

  manager = await createActor(
    "manager",
    ["workflows.manage", "products.create", "products.complete"],
    false,
  );
  workerA = await createActor(
    "worker-a",
    ["products.read", "products.reopen", "scans.perform", "scans.takeover"],
    true,
  );
  workerB = await createActor(
    "worker-b",
    ["products.read", "products.reopen", "scans.perform", "scans.takeover"],
    true,
  );
  for (const actor of [workerA, workerB]) {
    if (!actor.employee) throw new Error("Worker employee required");
    for (const productionRole of [roleA, roleB, roleC, unmappedRole]) {
      await prisma.employeeProductionRole.create({
        data: {
          organizationId: organizationA.id,
          employeeId: actor.employee.id,
          productionRoleId: productionRole.id,
          handlingLocationId: location.id,
        },
      });
    }
  }
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe.sequential("Phase 9 workflow engine", () => {
  it("creates immutable templates and rejects duplicate stage data and foreign mappings", async () => {
    setSession(manager);
    linearTemplate = await createWorkflowTemplate({
      name: `Linear Flow ${suffix}`,
      stages: linearStages(),
    });
    expect(linearTemplate).toMatchObject({ version: 1, isActive: true });
    expect(linearTemplate.stages.map((stage) => stage.position)).toEqual([
      1, 2, 3,
    ]);

    await expect(
      createWorkflowTemplate({
        name: `Duplicate ${suffix}`,
        stages: [
          {
            code: "SAME",
            name: "One",
            position: 1,
            productionRoleId: roleA.id,
          },
          {
            code: "SAME",
            name: "Two",
            position: 2,
            productionRoleId: roleB.id,
          },
        ],
      }),
    ).rejects.toMatchObject({
      code: WORKFLOW_ERROR_CODES.INVALID_WORKFLOW_INPUT,
    });
    await expect(
      createWorkflowTemplate({
        name: `Foreign ${suffix}`,
        stages: [
          {
            code: "FOREIGN",
            name: "Foreign",
            position: 1,
            productionRoleId: foreignRole.id,
          },
        ],
      }),
    ).rejects.toMatchObject({
      code: WORKFLOW_ERROR_CODES.WORKFLOW_ROLE_NOT_AVAILABLE,
    });
  });

  it("allocates concurrent versions safely and keeps only the latest successful version active", async () => {
    setSession(manager);
    const results = await Promise.allSettled([
      createWorkflowTemplateVersion({
        sourceTemplateId: linearTemplate.id,
        stages: linearStages(),
      }),
      createWorkflowTemplateVersion({
        sourceTemplateId: linearTemplate.id,
        stages: linearStages(),
      }),
    ]);
    expect(results.some((result) => result.status === "fulfilled")).toBe(true);

    const versions = await prisma.workflowTemplate.findMany({
      where: { organizationId: organizationA.id, name: linearTemplate.name },
      orderBy: { version: "asc" },
      select: { id: true, version: true, isActive: true },
    });
    expect(new Set(versions.map((version) => version.version)).size).toBe(
      versions.length,
    );
    expect(versions.filter((version) => version.isActive)).toHaveLength(1);
    linearTemplate = await prisma.workflowTemplate
      .findFirstOrThrow({
        where: {
          organizationId: organizationA.id,
          name: linearTemplate.name,
          isActive: true,
        },
        include: {
          stages: {
            orderBy: { position: "asc" },
            include: { productionRole: true },
          },
        },
      })
      .then((template) => ({
        id: template.id,
        name: template.name,
        version: template.version,
        isActive: template.isActive,
        createdAt: template.createdAt.toISOString(),
        stages: template.stages.map((stage) => ({
          id: stage.id,
          code: stage.code,
          name: stage.name,
          position: stage.position ?? 0,
          productionRole: stage.productionRole
            ? {
                id: stage.productionRole.id,
                code: stage.productionRole.code,
                name: stage.productionRole.name,
              }
            : null,
        })),
      }));
  });

  it("creates a Product snapshot atomically and preserves it across later template versions", async () => {
    setSession(manager);
    workflowProduct = await createProduct({
      workflowTemplateId: linearTemplate.id,
      idempotencyKey: randomUUID(),
    });
    expect(workflowProduct.workflow).toMatchObject({
      templateId: linearTemplate.id,
      sourceVersion: linearTemplate.version,
    });
    const before = await prisma.workflowSnapshot.findUniqueOrThrow({
      where: { productId: workflowProduct.id },
      include: { stages: { orderBy: { position: "asc" } } },
    });

    await createWorkflowTemplateVersion({
      sourceTemplateId: linearTemplate.id,
      stages: [
        ...linearStages(),
        {
          code: "EXTRA",
          name: "Extra",
          position: 4,
          productionRoleId: unmappedRole.id,
        },
      ],
    });
    const after = await prisma.workflowSnapshot.findUniqueOrThrow({
      where: { productId: workflowProduct.id },
      include: { stages: { orderBy: { position: "asc" } } },
    });
    expect(after.sourceVersion).toBe(before.sourceVersion);
    expect(
      after.stages.map(({ code, name, position }) => ({
        code,
        name,
        position,
      })),
    ).toEqual(
      before.stages.map(({ code, name, position }) => ({
        code,
        name,
        position,
      })),
    );
  });

  it("resolves initial, forward, backward, repeat, unmapped, and no-workflow movement", async () => {
    const snapshot = await prisma.workflowSnapshot.findUniqueOrThrow({
      where: { productId: workflowProduct.id },
      include: { stages: { orderBy: { position: "asc" } } },
    });
    const [stage1, stage2, stage3] = snapshot.stages;
    if (!stage1 || !stage2 || !stage3)
      throw new Error("Expected snapshot stages");

    const initial = await resolveWorkflowStageForRole({
      database: prisma,
      organizationId: organizationA.id,
      productId: workflowProduct.id,
      currentStageId: null,
      productionRoleId: roleA.id,
    });
    expect(initial).toMatchObject({
      kind: "RESOLVED",
      movement: "INITIAL",
      metadata: { deviation: false },
    });

    const forward = await resolveWorkflowStageForRole({
      database: prisma,
      organizationId: organizationA.id,
      productId: workflowProduct.id,
      currentStageId: stage1.id,
      productionRoleId: roleB.id,
    });
    expect(forward).toMatchObject({
      kind: "RESOLVED",
      movement: "FORWARD",
      metadata: { deviation: false },
    });
    const skipped = await resolveWorkflowStageForRole({
      database: prisma,
      organizationId: organizationA.id,
      productId: workflowProduct.id,
      currentStageId: stage1.id,
      productionRoleId: roleC.id,
    });
    expect(skipped).toMatchObject({
      kind: "RESOLVED",
      movement: "FORWARD",
      metadata: { deviation: true },
    });
    const backward = await resolveWorkflowStageForRole({
      database: prisma,
      organizationId: organizationA.id,
      productId: workflowProduct.id,
      currentStageId: stage3.id,
      productionRoleId: roleA.id,
    });
    expect(backward).toMatchObject({
      kind: "RESOLVED",
      movement: "BACKWARD",
      metadata: { isRework: true },
    });
    const repeat = await resolveWorkflowStageForRole({
      database: prisma,
      organizationId: organizationA.id,
      productId: workflowProduct.id,
      currentStageId: stage2.id,
      productionRoleId: roleB.id,
    });
    expect(repeat).toMatchObject({
      kind: "RESOLVED",
      movement: "REPEAT",
      metadata: { isRework: true },
    });
    const unmapped = await resolveWorkflowStageForRole({
      database: prisma,
      organizationId: organizationA.id,
      productId: workflowProduct.id,
      currentStageId: stage2.id,
      productionRoleId: unmappedRole.id,
    });
    expect(unmapped).toMatchObject({
      kind: "UNMAPPED_ROLE",
      movement: "UNMAPPED",
      metadata: { deviation: true },
    });

    setSession(manager);
    const noWorkflow = await createProduct({ idempotencyKey: randomUUID() });
    await expect(
      resolveWorkflowStageForRole({
        database: prisma,
        organizationId: organizationA.id,
        productId: noWorkflow.id,
        currentStageId: null,
        productionRoleId: roleA.id,
      }),
    ).resolves.toMatchObject({
      kind: "NO_WORKFLOW",
      stage: null,
      metadata: null,
    });
  });

  it("requires an explicit choice for ambiguous stages and validates the selected snapshot stage", async () => {
    setSession(manager);
    const ambiguous = await createWorkflowTemplate({
      name: `Ambiguous ${suffix}`,
      stages: [
        {
          code: "A1",
          name: "Choice One",
          position: 1,
          productionRoleId: roleA.id,
        },
        {
          code: "A2",
          name: "Choice Two",
          position: 2,
          productionRoleId: roleA.id,
        },
      ],
    });
    const product = await createProduct({
      workflowTemplateId: ambiguous.id,
      idempotencyKey: randomUUID(),
    });
    const snapshot = await prisma.workflowSnapshot.findUniqueOrThrow({
      where: { productId: product.id },
      include: { stages: { orderBy: { position: "asc" } } },
    });

    const required = await resolveWorkflowStageForRole({
      database: prisma,
      organizationId: organizationA.id,
      productId: product.id,
      currentStageId: null,
      productionRoleId: roleA.id,
    });
    expect(required).toMatchObject({ kind: "SELECTION_REQUIRED" });
    if (required.kind !== "SELECTION_REQUIRED")
      throw new Error("Selection expected");
    expect(required.selection.candidates).toHaveLength(2);
    await expect(
      resolveWorkflowStageForRole({
        database: prisma,
        organizationId: organizationA.id,
        productId: product.id,
        currentStageId: null,
        productionRoleId: roleA.id,
        selectedWorkflowStageId: randomUUID(),
      }),
    ).rejects.toMatchObject({
      code: WORKFLOW_ERROR_CODES.WORKFLOW_STAGE_NOT_AVAILABLE,
    });

    await setActiveRole(workerA, roleA.id);
    setSession(workerA);
    const firstKey = randomUUID();
    const firstScan = await scanProduct({
      barcode: product.barcode,
      idempotencyKey: firstKey,
    });
    expect(firstScan).toMatchObject({
      scanOutcome: "WORKFLOW_STAGE_SELECTION_REQUIRED",
      workflow: {
        selectionCandidates: [
          { id: snapshot.stages[0]?.id },
          { id: snapshot.stages[1]?.id },
        ],
      },
    });
    await expect(
      prisma.idempotencyKey.count({
        where: { organizationId: organizationA.id, key: firstKey },
      }),
    ).resolves.toBe(0);
    await expect(
      prisma.product.findUniqueOrThrow({
        where: { id: product.id },
        select: { status: true, version: true },
      }),
    ).resolves.toEqual({ status: "CREATED", version: 0 });

    const selected = snapshot.stages[1];
    if (!selected) throw new Error("Selected stage required");
    const received = await scanProduct({
      barcode: product.barcode,
      idempotencyKey: randomUUID(),
      selectedWorkflowStageId: selected.id,
    });
    expect(received).toMatchObject({
      status: "IN_PROGRESS",
      workflow: { actualStage: { id: selected.id } },
    });
    await expect(
      prisma.product.findUniqueOrThrow({
        where: { id: product.id },
        select: { currentStageId: true },
      }),
    ).resolves.toEqual({ currentStageId: selected.id });
  });

  it("persists receive, finish, complete, return, and takeover stages with workflow metadata", async () => {
    setSession(manager);
    const activeLinear = await prisma.workflowTemplate.findFirstOrThrow({
      where: {
        organizationId: organizationA.id,
        name: linearTemplate.name,
        isActive: true,
      },
      select: { id: true },
    });
    const product = await createProduct({
      workflowTemplateId: activeLinear.id,
      idempotencyKey: randomUUID(),
    });
    await setActiveRole(workerA, roleA.id);
    setSession(workerA);
    const received = await scanProduct({
      barcode: product.barcode,
      idempotencyKey: randomUUID(),
    });
    expect(received.workflow).toMatchObject({
      movement: "INITIAL",
      deviation: false,
    });
    const assignment = await prisma.productAssignment.findFirstOrThrow({
      where: { productId: product.id, endedAt: null },
      select: { workflowStageId: true },
    });
    expect(assignment.workflowStageId).toBe(received.workflow?.actualStage?.id);
    const finished = await finishProduct({
      productId: product.id,
      expectedVersion: received.version,
      idempotencyKey: randomUUID(),
    });
    expect(finished.workflow?.currentStage?.id).toBe(
      assignment.workflowStageId,
    );

    setSession(manager);
    const completed = await completeProduct({
      productId: product.id,
      expectedVersion: finished.version,
      idempotencyKey: randomUUID(),
    });
    expect(completed.workflow?.currentStage?.id).toBe(
      assignment.workflowStageId,
    );

    await setActiveRole(workerA, roleB.id);
    setSession(workerA);
    const returned = await returnCompletedProductToProcess({
      productId: product.id,
      expectedVersion: completed.version,
      idempotencyKey: randomUUID(),
    });
    expect(returned.workflow?.currentStage?.code).toBe("MIDDLE");
    await expect(
      prisma.productTransition.findFirstOrThrow({
        where: {
          productId: product.id,
          eventType: "PRODUCT_RETURNED_TO_PROCESS",
        },
        select: { fromStageId: true, toStageId: true, metadata: true },
      }),
    ).resolves.toMatchObject({
      fromStageId: assignment.workflowStageId,
      toStageId: returned.workflow?.currentStage?.id,
      metadata: { workflow: { movement: "FORWARD", deviation: false } },
    });

    setSession(manager);
    const takeoverProduct = await createProduct({
      workflowTemplateId: activeLinear.id,
      idempotencyKey: randomUUID(),
    });
    await setActiveRole(workerA, roleA.id);
    setSession(workerA);
    const initiallyReceived = await scanProduct({
      barcode: takeoverProduct.barcode,
      idempotencyKey: randomUUID(),
    });
    await setActiveRole(workerB, roleB.id);
    setSession(workerB);
    const takeover = await takeOverProduct({
      barcode: takeoverProduct.barcode,
      expectedVersion: initiallyReceived.version,
      idempotencyKey: randomUUID(),
    });
    expect(takeover.workflow).toMatchObject({
      actualStage: { code: "MIDDLE" },
      movement: "FORWARD",
      deviation: false,
    });
  });

  it("activates and deactivates versions without mutating Product snapshots", async () => {
    setSession(manager);
    const oldSnapshot = await prisma.workflowSnapshot.findUniqueOrThrow({
      where: { productId: workflowProduct.id },
      select: { sourceTemplateId: true, sourceVersion: true },
    });
    const oldTemplate = await setWorkflowTemplateActive(
      linearTemplate.id,
      true,
    );
    expect(oldTemplate.isActive).toBe(true);
    const deactivated = await setWorkflowTemplateActive(
      linearTemplate.id,
      false,
    );
    expect(deactivated.isActive).toBe(false);
    await expect(
      prisma.workflowSnapshot.findUniqueOrThrow({
        where: { productId: workflowProduct.id },
        select: { sourceTemplateId: true, sourceVersion: true },
      }),
    ).resolves.toEqual(oldSnapshot);
  });
});
