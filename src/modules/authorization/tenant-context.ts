import "server-only";

import { prisma } from "@/lib/db/client";
import { logger } from "@/lib/logging/logger";

import { AUTH_ERROR_CODES, FactoryFlowAuthError } from "../auth/auth-errors";
import { requireAuthenticatedUser } from "./authorization.service";
import {
  MEMBERSHIP_STATUS_ACTIVE,
  type TenantContext,
  type TenantContextResolution,
  type TenantMembershipOption,
} from "./authorization.types";

export async function resolveTenantContextForUser(
  userId: string,
): Promise<TenantContextResolution> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, isActive: true },
  });

  if (!user) {
    throw new FactoryFlowAuthError(AUTH_ERROR_CODES.UNAUTHENTICATED);
  }

  if (!user.isActive) {
    throw new FactoryFlowAuthError(AUTH_ERROR_CODES.USER_INACTIVE);
  }

  const memberships = await prisma.membership.findMany({
    where: { userId },
    select: {
      id: true,
      organizationId: true,
      status: true,
      organization: {
        select: { id: true, name: true, slug: true },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const activeMemberships: TenantMembershipOption[] = memberships
    .filter((membership) => membership.status === MEMBERSHIP_STATUS_ACTIVE)
    .map((membership) => ({
      membershipId: membership.id,
      organizationId: membership.organization.id,
      organizationName: membership.organization.name,
      organizationSlug: membership.organization.slug,
    }));

  if (activeMemberships.length === 0) {
    return {
      kind: memberships.length > 0 ? "membership-inactive" : "no-membership",
      userId,
    };
  }

  if (activeMemberships.length > 1) {
    return {
      kind: "selection-required",
      userId,
      memberships: activeMemberships,
    };
  }

  const [membership] = activeMemberships;
  if (!membership) {
    return { kind: "no-membership", userId };
  }

  return { kind: "resolved", context: { ...membership, userId } };
}

export async function getTenantContext(): Promise<TenantContext | null> {
  const user = await requireAuthenticatedUser();
  const resolution = await resolveTenantContextForUser(user.userId);

  if (resolution.kind === "resolved") {
    return resolution.context;
  }

  if (resolution.kind === "selection-required") {
    logger.warn(
      {
        event: "authorization_denied",
        reason: "ORGANIZATION_SELECTION_REQUIRED",
        userId: user.userId,
      },
      "Organization selection required",
    );
    throw new FactoryFlowAuthError(
      AUTH_ERROR_CODES.ORGANIZATION_SELECTION_REQUIRED,
    );
  }

  if (resolution.kind === "membership-inactive") {
    logger.warn(
      {
        event: "authorization_denied",
        reason: "MEMBERSHIP_INACTIVE",
        userId: user.userId,
      },
      "Inactive membership rejected",
    );
    throw new FactoryFlowAuthError(AUTH_ERROR_CODES.MEMBERSHIP_INACTIVE);
  }

  logger.warn(
    {
      event: "authorization_denied",
      reason: "TENANT_CONTEXT_REQUIRED",
      userId: user.userId,
    },
    "Tenant context required",
  );
  return null;
}

export async function requireTenantContext(): Promise<TenantContext> {
  const context = await getTenantContext();

  if (!context) {
    throw new FactoryFlowAuthError(AUTH_ERROR_CODES.TENANT_CONTEXT_REQUIRED);
  }

  return context;
}
