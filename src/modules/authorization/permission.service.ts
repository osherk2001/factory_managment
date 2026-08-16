import "server-only";

import { prisma } from "@/lib/db/client";
import { logger } from "@/lib/logging/logger";

import { AUTH_ERROR_CODES, FactoryFlowAuthError } from "../auth/auth-errors";
import { requireTenantContext } from "./tenant-context";
import type { PermissionCode, TenantContext } from "./authorization.types";

export async function getPermissionsForMembership(
  context: TenantContext,
): Promise<ReadonlySet<PermissionCode>> {
  const membership = await prisma.membership.findFirst({
    where: {
      id: context.membershipId,
      organizationId: context.organizationId,
      userId: context.userId,
      status: "ACTIVE",
    },
    select: {
      accessRoleLinks: {
        select: {
          accessRole: {
            select: {
              permissionLinks: {
                select: { permission: { select: { code: true } } },
              },
            },
          },
        },
      },
    },
  });

  if (!membership) {
    return new Set<PermissionCode>();
  }

  const permissions = new Set<PermissionCode>();
  for (const roleLink of membership.accessRoleLinks) {
    for (const permissionLink of roleLink.accessRole.permissionLinks) {
      permissions.add(permissionLink.permission.code);
    }
  }

  return permissions;
}

export async function hasPermission(
  permission: PermissionCode,
  context: TenantContext,
): Promise<boolean> {
  const permissions = await getPermissionsForMembership(context);
  return permissions.has(permission);
}

export async function requirePermission(
  permission: PermissionCode,
): Promise<TenantContext> {
  const context = await requireTenantContext();
  const allowed = await hasPermission(permission, context);

  if (!allowed) {
    logger.warn(
      {
        event: "authorization_denied",
        reason: "FORBIDDEN",
        permission,
        userId: context.userId,
        organizationId: context.organizationId,
      },
      "Permission authorization denied",
    );
    throw new FactoryFlowAuthError(AUTH_ERROR_CODES.FORBIDDEN);
  }

  return context;
}

export async function requireAnyPermission(
  permissions: readonly PermissionCode[],
): Promise<TenantContext> {
  const context = await requireTenantContext();
  const currentPermissions = await getPermissionsForMembership(context);
  const allowed = permissions.some((permission) =>
    currentPermissions.has(permission),
  );

  if (!allowed) {
    logger.warn(
      {
        event: "authorization_denied",
        reason: "FORBIDDEN",
        permissions,
        userId: context.userId,
        organizationId: context.organizationId,
      },
      "Permission authorization denied",
    );
    throw new FactoryFlowAuthError(AUTH_ERROR_CODES.FORBIDDEN);
  }

  return context;
}
