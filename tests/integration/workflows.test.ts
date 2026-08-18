import "dotenv/config";

import { randomUUID } from "node:crypto";

import { Prisma } from "@prisma/client";
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
import { SCAN_ERROR_CODES } from "../../src/modules/scanning/scan-errors";
import * as productionContextLock from "../../src/modules/worker-context/production-context-lock";
import { selectActiveProductionRole } from "../../src/modules/worker-context/server";
import {
  createWorkflowTemplate,
  createWorkflowTemplateVersion,
  isWorkflowError,
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

async function createWorkflowProductFixture(
  name: string,
  stages: readonly WorkflowTemplateStageInput[],
) {
  setSession(manager);
  const template = await createWorkflowTemplate({ name, stages });
  const product = await createProduct({
    workflowTemplateId: template.id,
    idempotencyKey: randomUUID(),
  });
  const snapshot = await prisma.workflowSnapshot.findUniqueOrThrow({
    where: { productId: product.id },
    include: { stages: { orderBy: { position: "asc" } } },
  });
  return { product, snapshot, template };
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function readWorkflowMetadata(metadata: Prisma.JsonValue | null) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    throw new Error("Expected transition metadata");
  }
  const workflow = metadata.workflow;
  if (!workflow || typeof workflow !== "object" || Array.isArray(workflow)) {
    throw new Error("Expected workflow transition metadata");
  }
  return workflow;
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

  it("allocates concurrent versions safely without mutating the source or persisting malformed versions", async () => {
    setSession(manager);
    const sourceBefore = await prisma.workflowTemplate.findUniqueOrThrow({
      where: { id: linearTemplate.id },
      select: {
        name: true,
        version: true,
        stages: {
          orderBy: { position: "asc" },
          select: {
            id: true,
            code: true,
            name: true,
            position: true,
            productionRoleId: true,
          },
        },
      },
    });
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
    for (const result of results) {
      if (result.status === "rejected") {
        expect(isWorkflowError(result.reason)).toBe(true);
        expect(result.reason).toMatchObject({
          code: WORKFLOW_ERROR_CODES.WORKFLOW_VERSION_CONFLICT,
        });
        expect(result.reason).not.toBeInstanceOf(
          Prisma.PrismaClientKnownRequestError,
        );
      }
    }

    const versions = await prisma.workflowTemplate.findMany({
      where: { organizationId: organizationA.id, name: linearTemplate.name },
      orderBy: { version: "asc" },
      select: {
        id: true,
        version: true,
        isActive: true,
        stages: { select: { id: true } },
      },
    });
    expect(new Set(versions.map((version) => version.version)).size).toBe(
      versions.length,
    );
    expect(versions.filter((version) => version.isActive)).toHaveLength(1);
    expect(versions.every((version) => version.stages.length === 3)).toBe(true);
    await expect(
      prisma.workflowTemplate.findUniqueOrThrow({
        where: { id: linearTemplate.id },
        select: {
          name: true,
          version: true,
          stages: {
            orderBy: { position: "asc" },
            select: {
              id: true,
              code: true,
              name: true,
              position: true,
              productionRoleId: true,
            },
          },
        },
      }),
    ).resolves.toEqual(sourceBefore);
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

  it("serializes concurrent activation and enforces one active version in PostgreSQL", async () => {
    setSession(manager);
    const familyName = `Activation Race ${suffix}`;
    const version1 = await createWorkflowTemplate({
      name: familyName,
      stages: linearStages(),
    });
    const version2 = await createWorkflowTemplateVersion({
      sourceTemplateId: version1.id,
      stages: linearStages(),
    });
    const version3 = await createWorkflowTemplateVersion({
      sourceTemplateId: version2.id,
      stages: linearStages(),
    });
    await setWorkflowTemplateActive(version3.id, false);

    const results = await Promise.allSettled([
      setWorkflowTemplateActive(version1.id, true),
      setWorkflowTemplateActive(version2.id, true),
    ]);
    expect(results.some((result) => result.status === "fulfilled")).toBe(true);
    for (const result of results) {
      if (result.status === "rejected") {
        expect(isWorkflowError(result.reason)).toBe(true);
        expect(result.reason).toMatchObject({
          code: WORKFLOW_ERROR_CODES.WORKFLOW_VERSION_CONFLICT,
        });
        expect(result.reason).not.toBeInstanceOf(
          Prisma.PrismaClientKnownRequestError,
        );
      }
    }

    await expect(
      prisma.workflowTemplate.count({
        where: {
          organizationId: organizationA.id,
          name: familyName,
          isActive: true,
        },
      }),
    ).resolves.toBe(1);
    await expect(
      prisma.workflowTemplate.create({
        data: {
          organizationId: organizationA.id,
          name: familyName,
          version: 4,
          isActive: true,
        },
      }),
    ).rejects.toMatchObject({ code: "P2002" });

    const foreignTemplate = await prisma.workflowTemplate.create({
      data: {
        organizationId: organizationB.id,
        name: `Foreign Activation ${suffix}`,
        version: 1,
        isActive: true,
      },
      select: { id: true },
    });
    await expect(
      setWorkflowTemplateActive(foreignTemplate.id, true),
    ).rejects.toMatchObject({
      code: WORKFLOW_ERROR_CODES.WORKFLOW_NOT_FOUND,
    });
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
        {
          code: "B1",
          name: "Different Role",
          position: 3,
          productionRoleId: roleB.id,
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
    const selectedKey = randomUUID();
    const received = await scanProduct({
      barcode: product.barcode,
      expectedVersion: firstScan.version,
      idempotencyKey: selectedKey,
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
    await expect(
      scanProduct({
        barcode: product.barcode,
        expectedVersion: firstScan.version,
        idempotencyKey: selectedKey,
        selectedWorkflowStageId: selected.id,
      }),
    ).resolves.toEqual(received);
    await expect(
      scanProduct({
        barcode: product.barcode,
        expectedVersion: firstScan.version,
        idempotencyKey: selectedKey,
        selectedWorkflowStageId: snapshot.stages[0]?.id,
      }),
    ).rejects.toMatchObject({
      code: SCAN_ERROR_CODES.IDEMPOTENCY_CONFLICT,
    });
    await expect(
      prisma.productAssignment.count({ where: { productId: product.id } }),
    ).resolves.toBe(1);
    await expect(
      prisma.productTransition.count({
        where: { productId: product.id, eventType: "PRODUCT_RECEIVED" },
      }),
    ).resolves.toBe(1);
  });

  it("rejects a stale explicit stage confirmation without partial writes", async () => {
    const { product, snapshot } = await createWorkflowProductFixture(
      `Stale Selection ${suffix}`,
      [
        {
          code: "STALE_A",
          name: "Stale A",
          position: 1,
          productionRoleId: roleA.id,
        },
        {
          code: "STALE_B",
          name: "Stale B",
          position: 2,
          productionRoleId: roleA.id,
        },
      ],
    );
    const [stageA, stageB] = snapshot.stages;
    if (!stageA || !stageB) throw new Error("Expected ambiguous stages");

    await setActiveRole(workerA, roleA.id);
    setSession(workerA);
    const initial = await scanProduct({
      barcode: product.barcode,
      idempotencyKey: randomUUID(),
    });
    expect(initial.scanOutcome).toBe("WORKFLOW_STAGE_SELECTION_REQUIRED");

    await scanProduct({
      barcode: product.barcode,
      expectedVersion: initial.version,
      idempotencyKey: randomUUID(),
      selectedWorkflowStageId: stageA.id,
    });
    const staleKey = randomUUID();
    const before = await Promise.all([
      prisma.productAssignment.count({ where: { productId: product.id } }),
      prisma.productTransition.count({
        where: { productId: product.id, eventType: "PRODUCT_RECEIVED" },
      }),
    ]);

    await expect(
      scanProduct({
        barcode: product.barcode,
        expectedVersion: initial.version,
        idempotencyKey: staleKey,
        selectedWorkflowStageId: stageB.id,
      }),
    ).rejects.toMatchObject({ code: SCAN_ERROR_CODES.SCAN_CONFLICT });

    await expect(
      prisma.product.findUniqueOrThrow({
        where: { id: product.id },
        select: { status: true, version: true, currentStageId: true },
      }),
    ).resolves.toEqual({
      status: "IN_PROGRESS",
      version: initial.version + 1,
      currentStageId: stageA.id,
    });
    await expect(
      Promise.all([
        prisma.productAssignment.count({ where: { productId: product.id } }),
        prisma.productTransition.count({
          where: { productId: product.id, eventType: "PRODUCT_RECEIVED" },
        }),
      ]),
    ).resolves.toEqual(before);
    await expect(
      prisma.productTransition.count({
        where: { productId: product.id, toStageId: stageB.id },
      }),
    ).resolves.toBe(0);
    await expect(
      prisma.idempotencyKey.count({
        where: { organizationId: organizationA.id, key: staleKey },
      }),
    ).resolves.toBe(0);
  });

  it("rejects stages from another Product, tenant, or ProductionRole with one safe error", async () => {
    const local = await createWorkflowProductFixture(
      `Stage Security ${suffix}`,
      [
        {
          code: "LOCAL_A1",
          name: "Local A1",
          position: 1,
          productionRoleId: roleA.id,
        },
        {
          code: "LOCAL_A2",
          name: "Local A2",
          position: 2,
          productionRoleId: roleA.id,
        },
        {
          code: "LOCAL_B",
          name: "Local B",
          position: 3,
          productionRoleId: roleB.id,
        },
      ],
    );
    const otherProduct = await createWorkflowProductFixture(
      `Other Product Stage ${suffix}`,
      [
        {
          code: "OTHER_A",
          name: "Other A",
          position: 1,
          productionRoleId: roleA.id,
        },
      ],
    );
    const foreignTemplate = await prisma.workflowTemplate.create({
      data: {
        organizationId: organizationB.id,
        name: `Foreign Stage ${suffix}`,
        version: 1,
        isActive: true,
      },
      select: { id: true },
    });
    const foreignTemplateStage = await prisma.workflowTemplateStage.create({
      data: {
        organizationId: organizationB.id,
        workflowTemplateId: foreignTemplate.id,
        productionRoleId: foreignRole.id,
        code: "FOREIGN_STAGE",
        name: "Foreign Stage",
        position: 1,
      },
      select: { id: true },
    });
    const foreignProduct = await prisma.product.create({
      data: {
        organizationId: organizationB.id,
        serialNumber: `PHASE9-FOREIGN-${suffix}`,
        status: "CREATED",
      },
      select: { id: true },
    });
    const foreignSnapshot = await prisma.workflowSnapshot.create({
      data: {
        organizationId: organizationB.id,
        productId: foreignProduct.id,
        sourceTemplateId: foreignTemplate.id,
        sourceVersion: 1,
      },
      select: { id: true },
    });
    const foreignStage = await prisma.workflowSnapshotStage.create({
      data: {
        organizationId: organizationB.id,
        workflowSnapshotId: foreignSnapshot.id,
        productId: foreignProduct.id,
        productionRoleId: foreignRole.id,
        sourceStageId: foreignTemplateStage.id,
        code: "FOREIGN_STAGE",
        name: "Foreign Stage",
        position: 1,
      },
      select: { id: true },
    });
    const otherStage = otherProduct.snapshot.stages[0];
    const differentRoleStage = local.snapshot.stages[2];
    if (!otherStage || !differentRoleStage) {
      throw new Error("Expected security fixture stages");
    }

    await setActiveRole(workerA, roleA.id);
    setSession(workerA);
    for (const selectedWorkflowStageId of [
      otherStage.id,
      foreignStage.id,
      differentRoleStage.id,
    ]) {
      const key = randomUUID();
      await expect(
        scanProduct({
          barcode: local.product.barcode,
          expectedVersion: 0,
          idempotencyKey: key,
          selectedWorkflowStageId,
        }),
      ).rejects.toMatchObject({
        code: WORKFLOW_ERROR_CODES.WORKFLOW_STAGE_NOT_AVAILABLE,
      });
      await expect(
        prisma.idempotencyKey.count({ where: { key } }),
      ).resolves.toBe(0);
    }
    await expect(
      prisma.product.findUniqueOrThrow({
        where: { id: local.product.id },
        select: { status: true, version: true, currentStageId: true },
      }),
    ).resolves.toEqual({
      status: "CREATED",
      version: 0,
      currentStageId: null,
    });
  });

  it("receives with an unmapped role while preserving the Product workflow stage", async () => {
    const { product, snapshot } = await createWorkflowProductFixture(
      `Integrated Unmapped ${suffix}`,
      linearStages(),
    );
    const stage2 = snapshot.stages[1];
    if (!stage2) throw new Error("Expected second workflow stage");
    await prisma.product.update({
      where: { id: product.id },
      data: { currentStageId: stage2.id },
    });

    await setActiveRole(workerA, unmappedRole.id);
    setSession(workerA);
    const result = await scanProduct({
      barcode: product.barcode,
      idempotencyKey: randomUUID(),
    });
    expect(result).toMatchObject({
      status: "IN_PROGRESS",
      currentWorker: { id: workerA.employee?.id },
      currentRole: { id: unmappedRole.id },
      currentLocation: { id: location.id },
      workflow: {
        currentStage: { id: stage2.id },
        actualStage: null,
        movement: "UNMAPPED",
        deviation: true,
        isRework: false,
      },
    });
    await expect(
      prisma.product.findUniqueOrThrow({
        where: { id: product.id },
        select: {
          status: true,
          currentWorkerId: true,
          currentRoleId: true,
          currentLocationId: true,
          currentStageId: true,
        },
      }),
    ).resolves.toEqual({
      status: "IN_PROGRESS",
      currentWorkerId: workerA.employee?.id,
      currentRoleId: unmappedRole.id,
      currentLocationId: location.id,
      currentStageId: stage2.id,
    });
    await expect(
      prisma.productAssignment.findFirstOrThrow({
        where: { productId: product.id, endedAt: null },
        select: { productionRoleId: true, workflowStageId: true },
      }),
    ).resolves.toEqual({
      productionRoleId: unmappedRole.id,
      workflowStageId: null,
    });
    const transition = await prisma.productTransition.findFirstOrThrow({
      where: { productId: product.id, eventType: "PRODUCT_RECEIVED" },
      select: { fromStageId: true, toStageId: true, metadata: true },
    });
    expect(transition).toMatchObject({
      fromStageId: stage2.id,
      toStageId: stage2.id,
    });
    expect(readWorkflowMetadata(transition.metadata)).toMatchObject({
      schemaVersion: 1,
      movement: "UNMAPPED",
      actualStageId: null,
      actualProductionRoleId: unmappedRole.id,
      deviation: true,
      isRework: false,
    });
  });

  it("uses the new role and its matching stage when role selection locks first", async () => {
    const { product, snapshot } = await createWorkflowProductFixture(
      `Role First Workflow ${suffix}`,
      [
        {
          code: "ROLE_FIRST_A",
          name: "Role First A",
          position: 1,
          productionRoleId: roleA.id,
        },
        {
          code: "ROLE_FIRST_B",
          name: "Role First B",
          position: 2,
          productionRoleId: roleB.id,
        },
      ],
    );
    const stageB = snapshot.stages[1];
    if (!workerA.employee || !stageB) {
      throw new Error("Expected role-first fixture data");
    }
    setSession(workerA);
    await selectActiveProductionRole(roleA.id);

    const roleLockAcquired = deferred();
    const scanLockAttempted = deferred();
    const releaseRoleSelection = deferred();
    const originalLock =
      productionContextLock.lockEmployeeForProductionMutation;
    let lockCall = 0;
    const lockSpy = vi
      .spyOn(productionContextLock, "lockEmployeeForProductionMutation")
      .mockImplementation(async (database, organizationId, employeeId) => {
        const call = lockCall++;
        if (call === 0) {
          await originalLock(database, organizationId, employeeId);
          roleLockAcquired.resolve();
          await releaseRoleSelection.promise;
          return;
        }
        scanLockAttempted.resolve();
        await originalLock(database, organizationId, employeeId);
      });

    try {
      const rolePromise = selectActiveProductionRole(roleB.id);
      await roleLockAcquired.promise;
      let scanCompleted = false;
      const scanPromise = scanProduct({
        barcode: product.barcode,
        idempotencyKey: randomUUID(),
      }).then((result) => {
        scanCompleted = true;
        return result;
      });
      await scanLockAttempted.promise;
      expect(scanCompleted).toBe(false);

      releaseRoleSelection.resolve();
      const [roleState, scanResult] = await Promise.all([
        rolePromise,
        scanPromise,
      ]);
      expect(roleState.activeProductionRole?.id).toBe(roleB.id);
      expect(scanResult).toMatchObject({
        currentRole: { id: roleB.id },
        workflow: { actualStage: { id: stageB.id } },
      });
      await expect(
        prisma.product.findUniqueOrThrow({
          where: { id: product.id },
          select: { currentRoleId: true, currentStageId: true },
        }),
      ).resolves.toEqual({
        currentRoleId: roleB.id,
        currentStageId: stageB.id,
      });
      await expect(
        prisma.productAssignment.findFirstOrThrow({
          where: { productId: product.id, endedAt: null },
          select: { productionRoleId: true, workflowStageId: true },
        }),
      ).resolves.toEqual({
        productionRoleId: roleB.id,
        workflowStageId: stageB.id,
      });
      await expect(
        prisma.productTransition.findFirstOrThrow({
          where: { productId: product.id, eventType: "PRODUCT_RECEIVED" },
          select: { toRoleId: true, toStageId: true },
        }),
      ).resolves.toEqual({ toRoleId: roleB.id, toStageId: stageB.id });
    } finally {
      releaseRoleSelection.resolve();
      lockSpy.mockRestore();
    }
  });

  it("commits the old role and matching stage before a waiting role selection", async () => {
    const { product, snapshot } = await createWorkflowProductFixture(
      `Scan First Workflow ${suffix}`,
      [
        {
          code: "SCAN_FIRST_A",
          name: "Scan First A",
          position: 1,
          productionRoleId: roleA.id,
        },
        {
          code: "SCAN_FIRST_B",
          name: "Scan First B",
          position: 2,
          productionRoleId: roleB.id,
        },
      ],
    );
    const stageA = snapshot.stages[0];
    if (!workerA.employee || !stageA) {
      throw new Error("Expected scan-first fixture data");
    }
    setSession(workerA);
    await selectActiveProductionRole(roleA.id);

    const scanLockAcquired = deferred();
    const roleLockAttempted = deferred();
    const releaseScan = deferred();
    const originalLock =
      productionContextLock.lockEmployeeForProductionMutation;
    let lockCall = 0;
    const lockSpy = vi
      .spyOn(productionContextLock, "lockEmployeeForProductionMutation")
      .mockImplementation(async (database, organizationId, employeeId) => {
        const call = lockCall++;
        if (call === 0) {
          await originalLock(database, organizationId, employeeId);
          scanLockAcquired.resolve();
          await releaseScan.promise;
          return;
        }
        roleLockAttempted.resolve();
        await originalLock(database, organizationId, employeeId);
      });

    try {
      const scanPromise = scanProduct({
        barcode: product.barcode,
        idempotencyKey: randomUUID(),
      });
      await scanLockAcquired.promise;
      let roleSelectionCompleted = false;
      const rolePromise = selectActiveProductionRole(roleB.id).then((state) => {
        roleSelectionCompleted = true;
        return state;
      });
      await roleLockAttempted.promise;
      expect(roleSelectionCompleted).toBe(false);

      releaseScan.resolve();
      const [scanResult, roleState] = await Promise.all([
        scanPromise,
        rolePromise,
      ]);
      expect(scanResult).toMatchObject({
        currentRole: { id: roleA.id },
        workflow: { actualStage: { id: stageA.id } },
      });
      expect(roleState.activeProductionRole?.id).toBe(roleB.id);
      await expect(
        prisma.product.findUniqueOrThrow({
          where: { id: product.id },
          select: { currentRoleId: true, currentStageId: true },
        }),
      ).resolves.toEqual({
        currentRoleId: roleA.id,
        currentStageId: stageA.id,
      });
      await expect(
        prisma.productAssignment.findFirstOrThrow({
          where: { productId: product.id, endedAt: null },
          select: { productionRoleId: true, workflowStageId: true },
        }),
      ).resolves.toEqual({
        productionRoleId: roleA.id,
        workflowStageId: stageA.id,
      });
      await expect(
        prisma.productTransition.findFirstOrThrow({
          where: { productId: product.id, eventType: "PRODUCT_RECEIVED" },
          select: { toRoleId: true, toStageId: true },
        }),
      ).resolves.toEqual({ toRoleId: roleA.id, toStageId: stageA.id });
      await expect(
        prisma.workerProductionContext.findUniqueOrThrow({
          where: {
            organizationId_employeeId: {
              organizationId: organizationA.id,
              employeeId: workerA.employee.id,
            },
          },
          select: { activeProductionRoleId: true },
        }),
      ).resolves.toEqual({ activeProductionRoleId: roleB.id });
    } finally {
      releaseScan.resolve();
      lockSpy.mockRestore();
    }
  });

  it("preserves the append-only actual path through skips, backward work, and repeats", async () => {
    const { product, snapshot } = await createWorkflowProductFixture(
      `Actual Path ${suffix}`,
      [
        {
          code: "PATH_1",
          name: "Path 1",
          position: 1,
          productionRoleId: roleA.id,
        },
        {
          code: "PATH_2",
          name: "Path 2",
          position: 2,
          productionRoleId: roleB.id,
        },
        {
          code: "PATH_3",
          name: "Path 3",
          position: 3,
          productionRoleId: roleC.id,
        },
        {
          code: "PATH_4",
          name: "Path 4",
          position: 4,
          productionRoleId: unmappedRole.id,
        },
      ],
    );
    if (snapshot.stages.length !== 4) {
      throw new Error("Expected four actual-path stages");
    }

    const receiveAt = async (productionRoleId: string) => {
      await setActiveRole(workerA, productionRoleId);
      setSession(workerA);
      return scanProduct({
        barcode: product.barcode,
        idempotencyKey: randomUUID(),
      });
    };
    const finish = async (version: number) => {
      setSession(workerA);
      return finishProduct({
        productId: product.id,
        expectedVersion: version,
        idempotencyKey: randomUUID(),
      });
    };

    const first = await receiveAt(roleA.id);
    await finish(first.version);
    const second = await receiveAt(roleB.id);
    await finish(second.version);
    const fourth = await receiveAt(unmappedRole.id);
    await finish(fourth.version);
    const backward = await receiveAt(roleB.id);
    await finish(backward.version);
    const repeated = await receiveAt(roleB.id);
    await finish(repeated.version);
    await receiveAt(roleC.id);

    const transitions = await prisma.productTransition.findMany({
      where: { productId: product.id, eventType: "PRODUCT_RECEIVED" },
      orderBy: [{ occurredAt: "asc" }, { createdAt: "asc" }],
      select: { toStageId: true, metadata: true },
    });
    expect(transitions).toHaveLength(6);
    expect(transitions.map((transition) => transition.toStageId)).toEqual([
      snapshot.stages[0]?.id,
      snapshot.stages[1]?.id,
      snapshot.stages[3]?.id,
      snapshot.stages[1]?.id,
      snapshot.stages[1]?.id,
      snapshot.stages[2]?.id,
    ]);
    const metadata = transitions.map((transition) =>
      readWorkflowMetadata(transition.metadata),
    );
    expect(metadata.map((workflow) => workflow.movement)).toEqual([
      "INITIAL",
      "FORWARD",
      "FORWARD",
      "BACKWARD",
      "REPEAT",
      "FORWARD",
    ]);
    expect(metadata[2]).toMatchObject({ deviation: true, isRework: false });
    expect(metadata[3]).toMatchObject({ deviation: true, isRework: true });
    expect(metadata[4]).toMatchObject({ deviation: true, isRework: true });
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
