import "dotenv/config";
import { randomUUID } from "node:crypto";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { Session } from "next-auth";
vi.mock("../../src/auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import { auth } from "../../src/auth";
import { prisma } from "../../src/lib/db/client";
import { makeFactory, makeActor, cleanupFactory } from "../helpers/factory";
import {
  createOrganization,
  createFactoryUser,
  resetFactoryPassword,
  updateMemberAccess,
  saveAccessRole,
  assignProductionRole,
  createReference,
} from "../../src/modules/administration/admin.service";
import {
  requireAuthenticatedUser,
  resolveTenantContextForUser,
} from "../../src/modules/authorization";
import { authenticateCredentials } from "../../src/modules/auth/authenticate";
import { selectOrganization } from "../../src/modules/auth/preferences";
let a: { id: string };
let b: { id: string };
let admin: Awaited<ReturnType<typeof makeActor>>;
let limited: Awaited<ReturnType<typeof makeActor>>;
let foreign: Awaited<ReturnType<typeof makeActor>>;
let platformId: string;
let onboardedId: string;
const authMock = auth as unknown as {
  mockResolvedValue: (session: Session | null) => void;
};
const session = (actor: typeof admin, version = 0) =>
  authMock.mockResolvedValue({
    user: {
      id: actor.user.id,
      username: actor.user.username,
      sessionVersion: version,
    },
    expires: new Date(Date.now() + 60000).toISOString(),
  });
describe.sequential("Factory administration security", () => {
  beforeAll(async () => {
    a = await makeFactory("Admin A");
    b = await makeFactory("Admin B");
    admin = await makeActor(a.id);
    limited = await makeActor(a.id, ["users.manage", "access_roles.manage"]);
    foreign = await makeActor(b.id);
    const platform = await prisma.user.create({
      data: { username: "platform-" + randomUUID(), isSystemAdmin: true },
    });
    platformId = platform.id;
  });
  beforeEach(() => session(admin));
  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { actorUserId: platformId } });
    if (onboardedId) await cleanupFactory(onboardedId);
    if (a) await cleanupFactory(a.id);
    if (b) await cleanupFactory(b.id);
    if (platformId) await prisma.user.delete({ where: { id: platformId } });
    await prisma.$disconnect();
  });
  it("keeps onboarding platform-only and creates an isolated first administrator", async () => {
    const input = {
      name: "New factory",
      slug: "onboard-" + randomUUID(),
      username: "onboard-admin-" + randomUUID(),
      password: "Test-onboarding-password-123",
    };
    await expect(createOrganization(input)).rejects.toMatchObject({
      code: "SYSTEM_ADMIN_REQUIRED",
    });
    authMock.mockResolvedValue({
      user: { id: platformId, username: "platform" },
      expires: new Date(Date.now() + 60000).toISOString(),
    });
    const organization = await createOrganization(input);
    onboardedId = organization.id;
    const member = await prisma.membership.findFirstOrThrow({
      where: { organizationId: organization.id },
      include: { user: true, accessRoleLinks: true },
    });
    expect(member.user.isSystemAdmin).toBe(false);
    expect(member.accessRoleLinks).toHaveLength(1);
    expect(member.user.passwordHash).not.toBe(input.password);
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { targetId: organization.id, action: "organization.onboarded" },
    });
    expect(audit.organizationId).toBeNull();
    expect(JSON.stringify(audit)).not.toContain(input.password);
  });
  it("creates employees, assigns only tenant production references and audits role setup", async () => {
    const role = await saveAccessRole({
      code: "WORKER",
      name: "Worker",
      permissions: ["products.read", "scans.perform"],
    });
    const user = await createFactoryUser({
      username: "new-worker-" + randomUUID(),
      displayName: "Worker",
      password: "Worker-password-123",
      accessRoleId: role.id,
    });
    const employee = await prisma.employeeProfile.findFirstOrThrow({
      where: { membershipId: user.membershipId, organizationId: a.id },
    });
    const productionRole = await createReference({
      kind: "productionRole",
      code: "ASSEMBLY",
      name: "Assembly",
    });
    const location = await createReference({
      kind: "location",
      code: "WORK",
      name: "Work",
      type: "WORK_AREA",
    });
    await assignProductionRole({
      employeeId: employee.id,
      productionRoleId: productionRole.id,
      handlingLocationId: location.id,
    });
    expect(
      await prisma.employeeProductionRole.count({
        where: { organizationId: a.id, employeeId: employee.id },
      }),
    ).toBe(1);
    session(foreign);
    const foreignLocation = await createReference({
      kind: "location",
      code: "FOREIGN",
      name: "Foreign",
      type: "SAFE",
    });
    session(admin);
    await expect(
      assignProductionRole({
        employeeId: employee.id,
        productionRoleId: productionRole.id,
        handlingLocationId: foreignLocation.id,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      createFactoryUser({
        username: "bad-" + randomUUID(),
        displayName: "Invalid",
        password: "Worker-password-123",
        accessRoleId: foreign.role.id,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  it("prevents delegated administrators from granting or editing privileges they do not hold", async () => {
    session(limited);
    await expect(
      createFactoryUser({
        username: "elevated-" + randomUUID(),
        displayName: "Invalid",
        password: "Worker-password-123",
        accessRoleId: admin.role.id,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      saveAccessRole({
        code: "ELEVATED",
        name: "Invalid",
        permissions: ["permissions.manage"],
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      updateMemberAccess({
        membershipId: admin.membership.id,
        accessRoleId: limited.role.id,
        active: false,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      resetFactoryPassword({
        membershipId: admin.membership.id,
        password: "Escalation-attempt-123",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    session(admin);
    await expect(
      updateMemberAccess({
        membershipId: admin.membership.id,
        accessRoleId: limited.role.id,
        active: false,
      }),
    ).rejects.toMatchObject({ code: "SELF_ACCESS_CHANGE" });
    await expect(
      updateMemberAccess({
        membershipId: foreign.membership.id,
        accessRoleId: limited.role.id,
        active: false,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  it("revokes existing sessions on password reset without exposing credentials in audit", async () => {
    const password = "Reset-password-" + randomUUID();
    await resetFactoryPassword({
      membershipId: limited.membership.id,
      password,
    });
    session(limited);
    await expect(requireAuthenticatedUser()).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });
    const login = await authenticateCredentials({
      username: limited.user.username,
      password,
    });
    expect(login?.sessionVersion).toBe(1);
    session(limited, 1);
    await expect(requireAuthenticatedUser()).resolves.toMatchObject({
      userId: limited.user.id,
    });
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: {
        organizationId: a.id,
        targetId: limited.membership.id,
        action: "user.password_reset",
      },
    });
    expect(JSON.stringify(audit)).not.toContain(password);
    session(admin);
    await expect(
      resetFactoryPassword({ membershipId: foreign.membership.id, password }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  it("validates organization preferences against active memberships and protects shared identities", async () => {
    const form = new FormData();
    form.set("organizationId", b.id);
    await expect(selectOrganization(form)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await prisma.membership.create({
      data: { organizationId: b.id, userId: admin.user.id, status: "ACTIVE" },
    });
    expect((await resolveTenantContextForUser(admin.user.id)).kind).toBe(
      "selection-required",
    );
    await selectOrganization(form);
    expect(await resolveTenantContextForUser(admin.user.id)).toMatchObject({
      kind: "resolved",
      context: { organizationId: b.id },
    });
    session(foreign);
    const shared = await prisma.membership.findFirstOrThrow({
      where: { userId: admin.user.id, organizationId: b.id },
    });
    await expect(
      resetFactoryPassword({
        membershipId: shared.id,
        password: "Not-allowed-password-123",
      }),
    ).rejects.toMatchObject({ code: "SHARED_IDENTITY" });
    await prisma.membership.delete({ where: { id: shared.id } });
    await prisma.user.update({
      where: { id: admin.user.id },
      data: { selectedOrganizationId: null },
    });
  });
});
