import "dotenv/config";

import { randomUUID } from "node:crypto";

import argon2 from "argon2";
import type { Session } from "next-auth";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("../../src/auth", () => ({ auth: vi.fn() }));

import { auth } from "../../src/auth";
import {
  authenticateCredentials,
  bootstrapSystemAdmin,
  hashPassword,
  verifyPassword,
} from "../../src/modules/auth";
import {
  getPermissionsForMembership,
  getTenantContext,
  getUserContextById,
  hasPermission,
  requireSystemAdmin,
  resolveTenantContextForUser,
  tenantWhere,
} from "../../src/modules/authorization";
import { prisma } from "../../src/lib/db/client";

const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`;
const authMock = auth as unknown as {
  mockResolvedValue: (value: Session | null) => void;
};

let organizationA: { id: string; name: string; slug: string };
let organizationB: { id: string };
let user: { id: string; username: string };
let userWithoutMembership: { id: string; username: string };
let inactiveUser: { id: string; username: string };
let systemAdmin: { id: string; username: string };
let bootstrapUserId: string | undefined;
let membershipA: { id: string };
let accessRoleA: { id: string };
let permission: { id: string; code: string };

async function setMockSession(userId: string, username = "phase4-user") {
  authMock.mockResolvedValue({
    user: { id: userId, username, name: username },
    expires: new Date(Date.now() + 60_000).toISOString(),
  });
}

function requireUsername(userRecord: { id: string; username: string | null }) {
  if (!userRecord.username) {
    throw new Error("Test user must have a username");
  }
  return { id: userRecord.id, username: userRecord.username };
}

describe.sequential("Phase 4 authentication and authorization", () => {
  beforeAll(async () => {
    organizationA = await prisma.organization.create({
      data: {
        name: `Phase 4 Factory ${suffix}`,
        slug: `phase4-a-${suffix}`,
      },
    });
    organizationB = await prisma.organization.create({
      data: {
        name: `Phase 4 Other Factory ${suffix}`,
        slug: `phase4-b-${suffix}`,
      },
    });

    const passwordHash = await hashPassword("correct-password-123");
    user = requireUsername(
      await prisma.user.create({
        data: {
          username: `phase4-user-${suffix}`,
          passwordHash,
          isActive: true,
        },
      }),
    );
    userWithoutMembership = requireUsername(
      await prisma.user.create({
        data: { username: `phase4-no-membership-${suffix}` },
      }),
    );
    inactiveUser = requireUsername(
      await prisma.user.create({
        data: {
          username: `phase4-inactive-${suffix}`,
          passwordHash,
          isActive: false,
        },
      }),
    );
    systemAdmin = requireUsername(
      await prisma.user.create({
        data: {
          username: `phase4-system-admin-${suffix}`,
          passwordHash,
          isSystemAdmin: true,
          isActive: true,
        },
      }),
    );

    membershipA = await prisma.membership.create({
      data: {
        organizationId: organizationA.id,
        userId: user.id,
        status: "ACTIVE",
      },
    });

    permission = await prisma.permission.create({
      data: {
        code: `phase4.test.${suffix}`,
        description: "Phase 4 authorization test permission",
      },
    });
    accessRoleA = await prisma.accessRole.create({
      data: {
        organizationId: organizationA.id,
        code: `PHASE4_ROLE_${suffix}`,
        name: "Phase 4 Test Role",
      },
    });
    await prisma.accessRolePermission.create({
      data: {
        accessRoleId: accessRoleA.id,
        permissionId: permission.id,
      },
    });
    await prisma.membershipAccessRole.create({
      data: {
        organizationId: organizationA.id,
        membershipId: membershipA.id,
        accessRoleId: accessRoleA.id,
      },
    });
  });

  afterAll(async () => {
    await prisma.membershipAccessRole.deleteMany({
      where: { organizationId: organizationA?.id },
    });
    await prisma.accessRolePermission.deleteMany({
      where: { accessRoleId: accessRoleA?.id },
    });
    await prisma.accessRole.deleteMany({
      where: { organizationId: organizationA?.id },
    });
    await prisma.permission.deleteMany({ where: { id: permission?.id } });
    await prisma.membership.deleteMany({
      where: { userId: { in: [user?.id, userWithoutMembership?.id] } },
    });
    await prisma.user.deleteMany({
      where: {
        id: {
          in: [
            user?.id,
            userWithoutMembership?.id,
            inactiveUser?.id,
            systemAdmin?.id,
            bootstrapUserId,
          ].filter((id): id is string => Boolean(id)),
        },
      },
    });
    await prisma.organization.deleteMany({
      where: { id: { in: [organizationA?.id, organizationB?.id] } },
    });
    await prisma.$disconnect();
  });

  it("hashes passwords and verifies only the correct password", async () => {
    const passwordHash = await hashPassword("a-valid-password-123");

    expect(passwordHash).not.toBe("a-valid-password-123");
    expect(passwordHash).toContain("argon2id");
    await expect(
      verifyPassword("a-valid-password-123", passwordHash),
    ).resolves.toBe(true);
    await expect(
      verifyPassword("a-different-password", passwordHash),
    ).resolves.toBe(false);
  });

  it("performs Argon2 verification for unknown and passwordless accounts", async () => {
    const verifySpy = vi.spyOn(argon2, "verify");

    try {
      await expect(
        authenticateCredentials({
          username: `unknown-timing-${suffix}`,
          password: "correct-password-123",
        }),
      ).resolves.toBeNull();
      await expect(
        authenticateCredentials({
          username: userWithoutMembership.username,
          password: "correct-password-123",
        }),
      ).resolves.toBeNull();
      await expect(
        authenticateCredentials({
          username: userWithoutMembership.username,
          password: "factoryflow-dummy-password",
        }),
      ).resolves.toBeNull();

      expect(verifySpy).toHaveBeenCalledTimes(3);
      expect(
        verifySpy.mock.calls.every(
          ([passwordHash]) =>
            typeof passwordHash === "string" &&
            passwordHash.startsWith("$argon2id$"),
        ),
      ).toBe(true);
    } finally {
      verifySpy.mockRestore();
    }
  });

  it("authenticates valid credentials and rejects every invalid account state", async () => {
    await expect(
      authenticateCredentials({
        username: user.username,
        password: "correct-password-123",
      }),
    ).resolves.toEqual({ id: user.id, username: user.username });
    await expect(
      authenticateCredentials({
        username: user.username,
        password: "wrong-password-123",
      }),
    ).resolves.toBeNull();
    await expect(
      authenticateCredentials({
        username: `unknown-${suffix}`,
        password: "correct-password-123",
      }),
    ).resolves.toBeNull();
    await expect(
      authenticateCredentials({
        username: userWithoutMembership.username,
        password: "correct-password-123",
      }),
    ).resolves.toBeNull();
    await expect(
      authenticateCredentials({
        username: `phase4-inactive-${suffix}`,
        password: "correct-password-123",
      }),
    ).resolves.toBeNull();
    await expect(
      authenticateCredentials({
        username: user.username,
        password: "short",
      }),
    ).resolves.toBeNull();
  });

  it("revalidates the current System Admin state from the database", async () => {
    await setMockSession(user.id, user.username);
    await expect(requireSystemAdmin()).rejects.toMatchObject({
      code: "SYSTEM_ADMIN_REQUIRED",
    });

    await setMockSession(systemAdmin.id, "phase4-system-admin");
    await expect(requireSystemAdmin()).resolves.toMatchObject({
      userId: systemAdmin.id,
      isSystemAdmin: true,
    });

    await prisma.user.update({
      where: { id: systemAdmin.id },
      data: { isActive: false },
    });
    await expect(requireSystemAdmin()).rejects.toMatchObject({
      code: "USER_INACTIVE",
    });
    await prisma.user.update({
      where: { id: systemAdmin.id },
      data: { isActive: true },
    });
  });

  it("creates System Admins, allows System Admin reruns, and refuses promotion", async () => {
    const bootstrapUsername = `phase4-bootstrap-${suffix}`;
    const created = await bootstrapSystemAdmin(prisma, {
      username: bootstrapUsername,
      passwordHash: "bootstrap-hash-one",
    });
    bootstrapUserId = created.id;

    expect(created.created).toBe(true);
    await expect(
      prisma.user.findUnique({
        where: { id: created.id },
        select: { isSystemAdmin: true, isActive: true, passwordHash: true },
      }),
    ).resolves.toEqual({
      isSystemAdmin: true,
      isActive: true,
      passwordHash: "bootstrap-hash-one",
    });
    await expect(
      prisma.membership.count({ where: { userId: created.id } }),
    ).resolves.toBe(0);

    await prisma.user.update({
      where: { id: created.id },
      data: { isActive: false },
    });
    const rerun = await bootstrapSystemAdmin(prisma, {
      username: bootstrapUsername,
      passwordHash: "bootstrap-hash-two",
    });
    expect(rerun.created).toBe(false);
    await expect(
      prisma.user.findUnique({
        where: { id: created.id },
        select: { isSystemAdmin: true, isActive: true, passwordHash: true },
      }),
    ).resolves.toEqual({
      isSystemAdmin: true,
      isActive: true,
      passwordHash: "bootstrap-hash-two",
    });

    await expect(
      bootstrapSystemAdmin(prisma, {
        username: userWithoutMembership.username,
        passwordHash: "must-not-be-used",
      }),
    ).rejects.toThrow(/refusing promotion/);
    await expect(
      prisma.user.findUnique({
        where: { id: userWithoutMembership.id },
        select: { isSystemAdmin: true, passwordHash: true },
      }),
    ).resolves.toEqual({ isSystemAdmin: false, passwordHash: null });
  });

  it("resolves one active Membership and rejects inactive or absent tenant context", async () => {
    const resolution = await resolveTenantContextForUser(user.id);
    expect(resolution).toMatchObject({
      kind: "resolved",
      context: {
        userId: user.id,
        membershipId: membershipA.id,
        organizationId: organizationA.id,
      },
    });

    await setMockSession(userWithoutMembership.id, "phase4-no-membership");
    await expect(getTenantContext()).resolves.toBeNull();

    await prisma.membership.create({
      data: {
        organizationId: organizationB.id,
        userId: userWithoutMembership.id,
        status: "INACTIVE",
      },
    });
    await expect(getTenantContext()).rejects.toMatchObject({
      code: "MEMBERSHIP_INACTIVE",
    });
  });

  it("does not silently choose among multiple active Memberships", async () => {
    const secondMembership = await prisma.membership.create({
      data: {
        organizationId: organizationB.id,
        userId: user.id,
        status: "ACTIVE",
      },
    });

    const resolution = await resolveTenantContextForUser(user.id);
    expect(resolution.kind).toBe("selection-required");
    if (resolution.kind === "selection-required") {
      expect(resolution.memberships).toHaveLength(2);
    }

    await setMockSession(user.id, user.username);
    await expect(getTenantContext()).rejects.toMatchObject({
      code: "ORGANIZATION_SELECTION_REQUIRED",
    });

    await prisma.membership.delete({ where: { id: secondMembership.id } });
  });

  it("resolves permissions through AccessRole and denies stale or unrelated authority", async () => {
    const resolved = await resolveTenantContextForUser(user.id);
    expect(resolved.kind).toBe("resolved");
    if (resolved.kind !== "resolved") {
      throw new Error("Expected one active Membership");
    }

    await expect(
      hasPermission(permission.code, resolved.context),
    ).resolves.toBe(true);
    await expect(
      hasPermission(
        "production-role-does-not-grant-permission",
        resolved.context,
      ),
    ).resolves.toBe(false);

    const forgedCrossTenantContext = {
      ...resolved.context,
      organizationId: organizationB.id,
      membershipId: membershipA.id,
    };
    await expect(
      getPermissionsForMembership(forgedCrossTenantContext),
    ).resolves.toEqual(new Set());
    expect(
      tenantWhere(resolved.context, {
        id: "resource-id",
        organizationId: organizationB.id,
      }),
    ).toEqual({ id: "resource-id", organizationId: organizationA.id });

    await prisma.membershipAccessRole.delete({
      where: {
        membershipId_accessRoleId: {
          membershipId: membershipA.id,
          accessRoleId: accessRoleA.id,
        },
      },
    });
    await expect(
      hasPermission(permission.code, resolved.context),
    ).resolves.toBe(false);

    await prisma.membershipAccessRole.create({
      data: {
        organizationId: organizationA.id,
        membershipId: membershipA.id,
        accessRoleId: accessRoleA.id,
      },
    });
  });

  it("returns a safe user context without exposing passwordHash", async () => {
    const context = await getUserContextById(user.id);

    expect(context).toEqual({
      userId: user.id,
      username: user.username,
      isActive: true,
      isSystemAdmin: false,
    });
    expect(context).not.toHaveProperty("passwordHash");
  });
});
