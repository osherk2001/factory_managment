import "server-only";

import { Prisma } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/lib/db/client";
import { requirePermission } from "@/modules/authorization";
import type { TenantContext } from "@/modules/authorization";

import { WORKFLOW_ERROR_CODES, WorkflowError } from "./workflow-errors";
import type {
  CreateWorkflowTemplateInput,
  CreateWorkflowTemplateVersionInput,
  WorkflowStageDto,
  WorkflowTemplateDto,
} from "./workflow-types";

const stageSchema = z
  .object({
    code: z.string().trim().min(1).max(100),
    name: z.string().trim().min(1).max(200),
    position: z.number().int().positive(),
    productionRoleId: z.string().uuid().nullable().optional(),
  })
  .strict();

const createTemplateSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    stages: z.array(stageSchema).min(1).max(100),
  })
  .strict();

const createVersionSchema = z
  .object({
    sourceTemplateId: z.string().uuid(),
    stages: z.array(stageSchema).min(1).max(100),
  })
  .strict();

const templateIdSchema = z.string().uuid();

const templateSelect = Prisma.validator<Prisma.WorkflowTemplateSelect>()({
  id: true,
  name: true,
  version: true,
  isActive: true,
  createdAt: true,
  stages: {
    orderBy: [{ position: "asc" }, { code: "asc" }],
    select: {
      id: true,
      code: true,
      name: true,
      position: true,
      productionRole: { select: { id: true, code: true, name: true } },
    },
  },
});

type TemplateRecord = Prisma.WorkflowTemplateGetPayload<{
  select: typeof templateSelect;
}>;
type ParsedStage = z.infer<typeof stageSchema>;

function parseOrThrow<T>(
  result: { success: true; data: T } | { success: false },
): T {
  if (!result.success) {
    throw new WorkflowError(WORKFLOW_ERROR_CODES.INVALID_WORKFLOW_INPUT);
  }
  return result.data;
}

function validateUniqueStages(stages: readonly ParsedStage[]): void {
  const codes = new Set<string>();
  const positions = new Set<number>();
  for (const stage of stages) {
    if (codes.has(stage.code) || positions.has(stage.position)) {
      throw new WorkflowError(WORKFLOW_ERROR_CODES.INVALID_WORKFLOW_INPUT);
    }
    codes.add(stage.code);
    positions.add(stage.position);
  }
}

async function validateRoleMappings(
  database: Prisma.TransactionClient,
  organizationId: string,
  stages: readonly ParsedStage[],
): Promise<void> {
  const roleIds = [
    ...new Set(
      stages.flatMap((stage) =>
        stage.productionRoleId ? [stage.productionRoleId] : [],
      ),
    ),
  ];
  if (roleIds.length === 0) return;

  const count = await database.productionRole.count({
    where: { id: { in: roleIds }, organizationId, isActive: true },
  });
  if (count !== roleIds.length) {
    throw new WorkflowError(WORKFLOW_ERROR_CODES.WORKFLOW_ROLE_NOT_AVAILABLE);
  }
}

function toTemplateDto(template: TemplateRecord): WorkflowTemplateDto {
  const stages: WorkflowStageDto[] = template.stages.map((stage) => {
    if (stage.position === null || stage.position <= 0) {
      throw new WorkflowError(WORKFLOW_ERROR_CODES.WORKFLOW_INVALID);
    }
    return { ...stage, position: stage.position };
  });

  return {
    id: template.id,
    name: template.name,
    version: template.version,
    isActive: template.isActive,
    createdAt: template.createdAt.toISOString(),
    stages,
  };
}

function isUniqueError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

async function writeAudit(
  database: Prisma.TransactionClient,
  context: TenantContext,
  action: string,
  template: { id: string; name: string; version: number; isActive: boolean },
): Promise<void> {
  await database.auditLog.create({
    data: {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      actorMembershipId: context.membershipId,
      action,
      targetType: "WorkflowTemplate",
      targetId: template.id,
      afterData: {
        name: template.name,
        version: template.version,
        isActive: template.isActive,
      },
    },
  });
}

export async function createWorkflowTemplate(
  input: CreateWorkflowTemplateInput,
): Promise<WorkflowTemplateDto> {
  const context = await requirePermission("workflows.manage");
  const parsed = parseOrThrow(createTemplateSchema.safeParse(input));
  validateUniqueStages(parsed.stages);

  try {
    return await prisma.$transaction(async (database) => {
      await validateRoleMappings(
        database,
        context.organizationId,
        parsed.stages,
      );
      const existing = await database.workflowTemplate.findFirst({
        where: { organizationId: context.organizationId, name: parsed.name },
        select: { id: true },
      });
      if (existing) {
        throw new WorkflowError(WORKFLOW_ERROR_CODES.WORKFLOW_NAME_CONFLICT);
      }

      const created = await database.workflowTemplate.create({
        data: {
          organizationId: context.organizationId,
          name: parsed.name,
          version: 1,
          isActive: true,
        },
        select: { id: true },
      });
      await database.workflowTemplateStage.createMany({
        data: parsed.stages.map((stage) => ({
          organizationId: context.organizationId,
          workflowTemplateId: created.id,
          code: stage.code,
          name: stage.name,
          position: stage.position,
          productionRoleId: stage.productionRoleId ?? null,
        })),
      });
      const template = await database.workflowTemplate.findUniqueOrThrow({
        where: { id: created.id },
        select: templateSelect,
      });
      await writeAudit(database, context, "workflow.created", template);
      return toTemplateDto(template);
    });
  } catch (error) {
    if (error instanceof WorkflowError) throw error;
    if (isUniqueError(error)) {
      throw new WorkflowError(WORKFLOW_ERROR_CODES.WORKFLOW_NAME_CONFLICT);
    }
    throw error;
  }
}

export async function createWorkflowTemplateVersion(
  input: CreateWorkflowTemplateVersionInput,
): Promise<WorkflowTemplateDto> {
  const context = await requirePermission("workflows.manage");
  const parsed = parseOrThrow(createVersionSchema.safeParse(input));
  validateUniqueStages(parsed.stages);

  try {
    return await prisma.$transaction(async (database) => {
      const source = await database.workflowTemplate.findFirst({
        where: {
          id: parsed.sourceTemplateId,
          organizationId: context.organizationId,
        },
        select: { name: true },
      });
      if (!source) {
        throw new WorkflowError(WORKFLOW_ERROR_CODES.WORKFLOW_NOT_FOUND);
      }
      await validateRoleMappings(
        database,
        context.organizationId,
        parsed.stages,
      );

      const latest = await database.workflowTemplate.aggregate({
        where: { organizationId: context.organizationId, name: source.name },
        _max: { version: true },
      });
      const version = (latest._max.version ?? 0) + 1;
      await database.workflowTemplate.updateMany({
        where: {
          organizationId: context.organizationId,
          name: source.name,
          isActive: true,
        },
        data: { isActive: false },
      });
      const created = await database.workflowTemplate.create({
        data: {
          organizationId: context.organizationId,
          name: source.name,
          version,
          isActive: true,
        },
        select: { id: true },
      });
      await database.workflowTemplateStage.createMany({
        data: parsed.stages.map((stage) => ({
          organizationId: context.organizationId,
          workflowTemplateId: created.id,
          code: stage.code,
          name: stage.name,
          position: stage.position,
          productionRoleId: stage.productionRoleId ?? null,
        })),
      });
      const template = await database.workflowTemplate.findUniqueOrThrow({
        where: { id: created.id },
        select: templateSelect,
      });
      await writeAudit(database, context, "workflow.version_created", template);
      return toTemplateDto(template);
    });
  } catch (error) {
    if (error instanceof WorkflowError) throw error;
    if (isUniqueError(error)) {
      throw new WorkflowError(WORKFLOW_ERROR_CODES.WORKFLOW_VERSION_CONFLICT);
    }
    throw error;
  }
}

export async function setWorkflowTemplateActive(
  workflowTemplateId: string,
  isActive: boolean,
): Promise<WorkflowTemplateDto> {
  const context = await requirePermission("workflows.manage");
  const id = parseOrThrow(templateIdSchema.safeParse(workflowTemplateId));

  return prisma.$transaction(async (database) => {
    const existing = await database.workflowTemplate.findFirst({
      where: { id, organizationId: context.organizationId },
      select: { id: true, name: true },
    });
    if (!existing) {
      throw new WorkflowError(WORKFLOW_ERROR_CODES.WORKFLOW_NOT_FOUND);
    }

    if (isActive) {
      await database.workflowTemplate.updateMany({
        where: {
          organizationId: context.organizationId,
          name: existing.name,
          isActive: true,
          id: { not: existing.id },
        },
        data: { isActive: false },
      });
    }
    const template = await database.workflowTemplate.update({
      where: { id: existing.id },
      data: { isActive },
      select: templateSelect,
    });
    await writeAudit(
      database,
      context,
      isActive ? "workflow.activated" : "workflow.deactivated",
      template,
    );
    return toTemplateDto(template);
  });
}

export async function listWorkflowTemplates(): Promise<
  readonly WorkflowTemplateDto[]
> {
  const context = await requirePermission("workflows.manage");
  const templates = await prisma.workflowTemplate.findMany({
    where: { organizationId: context.organizationId },
    orderBy: [{ name: "asc" }, { version: "desc" }],
    select: templateSelect,
  });
  return templates.map(toTemplateDto);
}

export async function listActiveWorkflowTemplatesForOrganization(
  organizationId: string,
): Promise<readonly WorkflowTemplateDto[]> {
  const templates = await prisma.workflowTemplate.findMany({
    where: { organizationId, isActive: true },
    orderBy: [{ name: "asc" }, { version: "desc" }],
    select: templateSelect,
  });
  return templates.map(toTemplateDto);
}
