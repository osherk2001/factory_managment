import "server-only";

import { createHash } from "node:crypto";

import { IssueStatus, Prisma } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/lib/db/client";
import { logger } from "@/lib/logging/logger";
import { requirePermission } from "@/modules/authorization";
import type { TenantContext } from "@/modules/authorization";

import { IssueError, ISSUE_ERROR_CODES } from "./issue-errors";
import type {
  CreateIssueInput,
  IssueDto,
  ResolveIssueInput,
} from "./issue-types";

const createIssueSchema = z.object({
  productId: z.string().uuid(),
  type: z.string().trim().min(1).max(100),
  description: z.string().trim().max(5000).nullable().optional(),
  idempotencyKey: z.string().trim().min(1).max(255),
});

const resolveIssueSchema = z.object({
  issueId: z.string().uuid(),
  resolution: z.string().trim().max(5000).nullable().optional(),
  idempotencyKey: z.string().trim().min(1).max(255),
});

const issueSelect = {
  id: true,
  productId: true,
  type: true,
  description: true,
  status: true,
  createdAt: true,
  resolvedAt: true,
  resolution: true,
  reportedByUser: { select: { id: true, username: true } },
  resolvedByUser: { select: { id: true, username: true } },
} satisfies Prisma.IssueSelect;

type IssueRecord = Prisma.IssueGetPayload<{ select: typeof issueSelect }>;

function normalizeType(value: string): string {
  return value.trim().toUpperCase();
}

function toDto(issue: IssueRecord): IssueDto {
  return {
    id: issue.id,
    productId: issue.productId,
    type: issue.type,
    description: issue.description,
    status: issue.status,
    reportedBy: issue.reportedByUser,
    resolvedBy: issue.resolvedByUser,
    createdAt: issue.createdAt.toISOString(),
    resolvedAt: issue.resolvedAt?.toISOString() ?? null,
    resolution: issue.resolution,
  };
}

function hashInput(input: unknown): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

function isUniqueError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

async function replayIssue(
  context: TenantContext,
  key: string,
  operation: string,
  requestHash: string,
): Promise<IssueDto | null> {
  const existing = await prisma.idempotencyKey.findUnique({
    where: {
      organizationId_userId_key: {
        organizationId: context.organizationId,
        userId: context.userId,
        key,
      },
    },
    select: {
      operation: true,
      requestHash: true,
      resultReference: true,
      resultData: true,
    },
  });

  if (!existing) return null;
  if (
    existing.operation !== operation ||
    existing.requestHash !== requestHash
  ) {
    throw new IssueError(ISSUE_ERROR_CODES.IDEMPOTENCY_CONFLICT);
  }

  const parsed = z
    .object({ id: z.string().uuid() })
    .passthrough()
    .safeParse(existing.resultData);
  if (!parsed.success || parsed.data.id !== existing.resultReference) {
    logger.error(
      { event: "issue_create_failed", organizationId: context.organizationId },
      "Issue creation failed",
    );
    throw new IssueError(ISSUE_ERROR_CODES.FAILED);
  }
  return parsed.data as IssueDto;
}

export async function createIssue(input: CreateIssueInput): Promise<IssueDto> {
  const parsed = createIssueSchema.safeParse(input);
  if (!parsed.success) throw new IssueError(ISSUE_ERROR_CODES.INVALID_INPUT);
  const context = await requirePermission("issues.create");
  const normalized = {
    productId: parsed.data.productId,
    type: normalizeType(parsed.data.type),
    description: parsed.data.description?.trim() || null,
  };
  const requestHash = hashInput(normalized);
  const replay = await replayIssue(
    context,
    parsed.data.idempotencyKey,
    "issues.create",
    requestHash,
  );
  if (replay) return replay;

  try {
    return await prisma.$transaction(async (database) => {
      await database.idempotencyKey.create({
        data: {
          organizationId: context.organizationId,
          userId: context.userId,
          actorMembershipId: context.membershipId,
          key: parsed.data.idempotencyKey,
          operation: "issues.create",
          requestHash,
        },
      });

      const product = await database.product.findFirst({
        where: {
          id: normalized.productId,
          organizationId: context.organizationId,
        },
        select: { id: true },
      });
      if (!product) throw new IssueError(ISSUE_ERROR_CODES.PRODUCT_NOT_FOUND);

      const issue = await database.issue.create({
        data: {
          organizationId: context.organizationId,
          productId: product.id,
          reportedByUserId: context.userId,
          reportedByMembershipId: context.membershipId,
          type: normalized.type,
          description: normalized.description,
          status: IssueStatus.OPEN,
        },
        select: issueSelect,
      });
      const result = toDto(issue);

      await database.auditLog.create({
        data: {
          organizationId: context.organizationId,
          actorUserId: context.userId,
          actorMembershipId: context.membershipId,
          action: "issue.created",
          targetType: "Issue",
          targetId: issue.id,
          afterData: {
            type: issue.type,
            status: issue.status,
            productId: issue.productId,
          },
        },
      });
      await database.idempotencyKey.updateMany({
        where: {
          organizationId: context.organizationId,
          userId: context.userId,
          key: parsed.data.idempotencyKey,
        },
        data: { resultReference: issue.id, resultData: result },
      });
      return result;
    });
  } catch (error) {
    if (isUniqueError(error)) {
      const result = await replayIssue(
        context,
        parsed.data.idempotencyKey,
        "issues.create",
        requestHash,
      );
      if (result) return result;
    }
    if (error instanceof IssueError) throw error;
    logger.error(
      { event: "issue_create_failed", organizationId: context.organizationId },
      "Issue creation failed",
    );
    throw new IssueError(ISSUE_ERROR_CODES.FAILED);
  }
}

export async function resolveIssue(
  input: ResolveIssueInput,
): Promise<IssueDto> {
  const parsed = resolveIssueSchema.safeParse(input);
  if (!parsed.success) throw new IssueError(ISSUE_ERROR_CODES.INVALID_INPUT);
  const context = await requirePermission("issues.resolve");
  const resolution = parsed.data.resolution?.trim() || null;
  const requestHash = hashInput({ issueId: parsed.data.issueId, resolution });
  const replay = await replayIssue(
    context,
    parsed.data.idempotencyKey,
    "issues.resolve",
    requestHash,
  );
  if (replay) return replay;

  try {
    return await prisma.$transaction(async (database) => {
      await database.idempotencyKey.create({
        data: {
          organizationId: context.organizationId,
          userId: context.userId,
          actorMembershipId: context.membershipId,
          key: parsed.data.idempotencyKey,
          operation: "issues.resolve",
          requestHash,
        },
      });

      const current = await database.issue.findFirst({
        where: {
          id: parsed.data.issueId,
          organizationId: context.organizationId,
        },
        select: issueSelect,
      });
      if (!current) throw new IssueError(ISSUE_ERROR_CODES.NOT_FOUND);
      if (current.status !== IssueStatus.OPEN)
        throw new IssueError(ISSUE_ERROR_CODES.INVALID_STATE);

      const changed = await database.issue.updateMany({
        where: {
          id: current.id,
          organizationId: context.organizationId,
          status: IssueStatus.OPEN,
        },
        data: {
          status: IssueStatus.RESOLVED,
          resolvedAt: new Date(),
          resolvedByUserId: context.userId,
          resolvedByMembershipId: context.membershipId,
          resolution,
        },
      });
      if (changed.count !== 1)
        throw new IssueError(ISSUE_ERROR_CODES.INVALID_STATE);
      const resolved = await database.issue.findFirstOrThrow({
        where: { id: current.id, organizationId: context.organizationId },
        select: issueSelect,
      });
      const result = toDto(resolved);
      await database.auditLog.create({
        data: {
          organizationId: context.organizationId,
          actorUserId: context.userId,
          actorMembershipId: context.membershipId,
          action: "issue.resolved",
          targetType: "Issue",
          targetId: resolved.id,
          beforeData: { status: current.status },
          afterData: {
            status: resolved.status,
            resolvedAt: resolved.resolvedAt?.toISOString(),
            resolution,
          },
        },
      });
      await database.idempotencyKey.updateMany({
        where: {
          organizationId: context.organizationId,
          userId: context.userId,
          key: parsed.data.idempotencyKey,
        },
        data: { resultReference: resolved.id, resultData: result },
      });
      return result;
    });
  } catch (error) {
    if (isUniqueError(error)) {
      const result = await replayIssue(
        context,
        parsed.data.idempotencyKey,
        "issues.resolve",
        requestHash,
      );
      if (result) return result;
    }
    if (error instanceof IssueError) throw error;
    logger.error(
      { event: "issue_resolve_failed", organizationId: context.organizationId },
      "Issue resolution failed",
    );
    throw new IssueError(ISSUE_ERROR_CODES.FAILED);
  }
}

export async function listProductIssues(
  productId: string,
): Promise<IssueDto[]> {
  const context = await requirePermission("issues.read");
  return listProductIssuesForTenant(context, productId);
}

export async function listProductIssuesForTenant(
  context: TenantContext,
  productId: string,
): Promise<IssueDto[]> {
  const parsed = z.string().uuid().safeParse(productId);
  if (!parsed.success) throw new IssueError(ISSUE_ERROR_CODES.NOT_FOUND);
  const issues = await prisma.issue.findMany({
    where: { organizationId: context.organizationId, productId: parsed.data },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    select: issueSelect,
  });
  return issues.map(toDto);
}

export async function countOpenIssuesForTenant(
  context: TenantContext,
): Promise<number> {
  return prisma.issue.count({
    where: { organizationId: context.organizationId, status: IssueStatus.OPEN },
  });
}
