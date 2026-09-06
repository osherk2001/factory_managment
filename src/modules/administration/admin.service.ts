import "server-only";
import { z } from "zod";
import { LocationType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/client";
import { requirePermission, getPermissionsForMembership, requireAnyPermission, requireSystemAdmin } from "@/modules/authorization";
import { PERMISSION_CODES } from "@/modules/authorization/permissions";
import { hashPassword, passwordSchema } from "@/modules/auth/password";
import { lockEmployeeForProductionMutation } from "@/modules/worker-context/production-context-lock";
import { ApplicationError } from "@/shared/errors";
import type { TenantContext } from "@/modules/authorization";

const name = z.string().trim().min(1).max(200);
const code = z.string().trim().min(1).max(100).regex(/^[A-Za-z0-9][A-Za-z0-9_.-]*$/);
const username = z.string().trim().min(1).max(100);
const uuid = z.string().uuid();
function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new ApplicationError("INVALID_INPUT", "Invalid administration input");
  return parsed.data;
}
function fail(code: string): never { throw new ApplicationError(code, code); }
async function authorize(permission: string, additional: string[] = []) {
  const context = await requirePermission(permission);
  const permissions = await getPermissionsForMembership(context);
  if (additional.some(p => !permissions.has(p))) fail("FORBIDDEN");
  return { context, permissions };
}
async function audit(database: Prisma.TransactionClient, context: TenantContext, action: string, targetType: string, targetId: string, beforeData?: Prisma.InputJsonValue, afterData?: Prisma.InputJsonValue) {
  await database.auditLog.create({ data: { organizationId: context.organizationId, actorUserId: context.userId, actorMembershipId: context.membershipId, action, targetType, targetId, beforeData, afterData } });
}
async function lockOrganization(database: Prisma.TransactionClient, context: TenantContext) {
  await database.$queryRaw`SELECT "id" FROM "Organization" WHERE "id" = ${context.organizationId}::uuid FOR UPDATE`;
}
async function checkAssignableRole(database: Prisma.TransactionClient, context: TenantContext, roleId: string, permissions: ReadonlySet<string>) {
  const role = await database.accessRole.findFirst({ where: { id: roleId, organizationId: context.organizationId }, select: { id: true, permissionLinks: { select: { permission: { select: { code: true } } } } } });
  if (!role) fail("NOT_FOUND");
  if (role.permissionLinks.some(link => !permissions.has(link.permission.code))) fail("FORBIDDEN");
  return role;
}

export async function createOrganization(input: unknown) {
  const actor = await requireSystemAdmin();
  const command = parse(z.object({ name, slug: code.transform(v => v.toLowerCase()), username, password: passwordSchema }), input);
  const passwordHash = await hashPassword(command.password);
  return prisma.$transaction(async database => {
    await database.permission.createMany({ data: PERMISSION_CODES.map(code => ({ code })), skipDuplicates: true });
    const organization = await database.organization.create({ data: { name: command.name, slug: command.slug }, select: { id: true, name: true } });
    const user = await database.user.create({ data: { username: command.username, passwordHash }, select: { id: true } });
    const member = await database.membership.create({ data: { organizationId: organization.id, userId: user.id, status: "ACTIVE" } });
    const role = await database.accessRole.create({ data: { organizationId: organization.id, code: "FACTORY_ADMIN", name: "Factory Admin" } });
    const permissions = await database.permission.findMany({ where: { code: { in: [...PERMISSION_CODES] } }, select: { id: true } });
    await database.accessRolePermission.createMany({ data: permissions.map(p => ({ accessRoleId: role.id, permissionId: p.id })) });
    await database.membershipAccessRole.create({ data: { organizationId: organization.id, membershipId: member.id, accessRoleId: role.id } });
    await database.auditLog.create({ data: { actorUserId: actor.userId, action: "organization.onboarded", targetType: "Organization", targetId: organization.id, afterData: { organizationId: organization.id, administratorUserId: user.id, membershipId: member.id, accessRoleId: role.id } } });
    return organization;
  });
}

export async function createFactoryUser(input: unknown) {
  const { context, permissions } = await authorize("users.manage", ["access_roles.manage"]);
  const command = parse(z.object({ username, password: passwordSchema, displayName: name, accessRoleId: uuid }), input);
  const passwordHash = await hashPassword(command.password);
  return prisma.$transaction(async database => {
    await lockOrganization(database, context);
    await checkAssignableRole(database, context, command.accessRoleId, permissions);
    const user = await database.user.create({ data: { username: command.username, passwordHash }, select: { id: true } });
    const membership = await database.membership.create({ data: { organizationId: context.organizationId, userId: user.id, status: "ACTIVE" }, select: { id: true } });
    await database.membershipAccessRole.create({ data: { organizationId: context.organizationId, membershipId: membership.id, accessRoleId: command.accessRoleId } });
    await database.employeeProfile.create({ data: { organizationId: context.organizationId, membershipId: membership.id, displayName: command.displayName } });
    await audit(database, context, "user.created", "Membership", membership.id, undefined, { userId: user.id, accessRoleId: command.accessRoleId });
    return { membershipId: membership.id };
  });
}

export async function resetFactoryPassword(input: unknown) {
  const { context } = await authorize("users.manage");
  const command = parse(z.object({ membershipId: uuid, password: passwordSchema }), input);
  const passwordHash = await hashPassword(command.password);
  return prisma.$transaction(async database => {
    const member = await database.membership.findFirst({ where: { id: command.membershipId, organizationId: context.organizationId }, select: { userId: true } });
    if (!member) fail("NOT_FOUND");
    await database.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${member.userId}::uuid FOR UPDATE`;
    const user = await database.user.findUniqueOrThrow({ where: { id: member.userId }, select: { isSystemAdmin: true, _count: { select: { memberships: true } } } });
    if (user.isSystemAdmin || user._count.memberships !== 1) fail("SHARED_IDENTITY");
    await database.user.update({ where: { id: member.userId }, data: { passwordHash, sessionVersion: { increment: 1 } } });
    await audit(database, context, "user.password_reset", "Membership", command.membershipId, undefined, { sessionsRevoked: true });
  });
}

export async function updateMemberAccess(input: unknown) {
  const { context, permissions } = await authorize("users.manage", ["access_roles.manage"]);
  const command = parse(z.object({ membershipId: uuid, accessRoleId: uuid, active: z.boolean() }), input);
  if (command.membershipId === context.membershipId) fail("SELF_ACCESS_CHANGE");
  return prisma.$transaction(async database => {
    await lockOrganization(database, context);
    const member = await database.membership.findFirst({ where: { id: command.membershipId, organizationId: context.organizationId }, select: { id: true, status: true, accessRoleLinks: { select: { accessRoleId: true } } } });
    if (!member) fail("NOT_FOUND");
    await checkAssignableRole(database, context, command.accessRoleId, permissions);
    for (const role of member.accessRoleLinks) await checkAssignableRole(database, context, role.accessRoleId, permissions);
    await database.membershipAccessRole.deleteMany({ where: { organizationId: context.organizationId, membershipId: member.id } });
    await database.membershipAccessRole.create({ data: { organizationId: context.organizationId, membershipId: member.id, accessRoleId: command.accessRoleId } });
    await database.membership.updateMany({ where: { id: member.id, organizationId: context.organizationId }, data: { status: command.active ? "ACTIVE" : "INACTIVE" } });
    await audit(database, context, "membership.access_updated", "Membership", member.id, { status: member.status, roles: member.accessRoleLinks.map(r => r.accessRoleId) }, { status: command.active ? "ACTIVE" : "INACTIVE", roles: [command.accessRoleId] });
  });
}

export async function saveAccessRole(input: unknown) {
  const { context, permissions } = await authorize("access_roles.manage", ["permissions.manage"]);
  const command = parse(z.object({ id: uuid.optional(), code, name, permissions: z.array(z.enum(PERMISSION_CODES)).max(PERMISSION_CODES.length) }), input);
  if (command.permissions.some(p => !permissions.has(p))) fail("FORBIDDEN");
  return prisma.$transaction(async database => {
    await lockOrganization(database, context);
    const existing = command.id ? await database.accessRole.findFirst({ where: { id: command.id, organizationId: context.organizationId }, select: { id: true, code: true, name: true, permissionLinks: { select: { permission: { select: { code: true } } } }, membershipLinks: { where: { membershipId: context.membershipId }, select: { membershipId: true } } } }) : null;
    if (command.id && !existing) fail("NOT_FOUND");
    if (existing?.membershipLinks.length) fail("SELF_ACCESS_CHANGE");
    if (existing?.permissionLinks.some(p => !permissions.has(p.permission.code))) fail("FORBIDDEN");
    const role = existing ? await database.accessRole.update({ where: { id: existing.id, organizationId: context.organizationId }, data: { name: command.name, code: command.code }, select: { id: true } })
      : await database.accessRole.create({ data: { organizationId: context.organizationId, code: command.code, name: command.name }, select: { id: true } });
    const chosen = await database.permission.findMany({ where: { code: { in: command.permissions } }, select: { id: true } });
    if (chosen.length !== new Set(command.permissions).size) fail("INVALID_INPUT");
    await database.accessRolePermission.deleteMany({ where: { accessRoleId: role.id, accessRole: { organizationId: context.organizationId } } });
    await database.accessRolePermission.createMany({ data: chosen.map(p => ({ accessRoleId: role.id, permissionId: p.id })) });
    await audit(database, context, existing ? "access_role.updated" : "access_role.created", "AccessRole", role.id, existing ? { code: existing.code, name: existing.name, permissions: existing.permissionLinks.map(p => p.permission.code) } : undefined, { code: command.code, name: command.name, permissions: command.permissions });
    return role;
  });
}

export async function assignProductionRole(input: unknown) {
  const { context } = await authorize("production_roles.manage", ["users.manage"]);
  const command = parse(z.object({ employeeId: uuid, productionRoleId: uuid, handlingLocationId: uuid }), input);
  return prisma.$transaction(async database => {
    await lockEmployeeForProductionMutation(database, context.organizationId, command.employeeId);
    const role = await database.productionRole.findFirst({ where: { id: command.productionRoleId, organizationId: context.organizationId, isActive: true } });
    const location = await database.location.findFirst({ where: { id: command.handlingLocationId, organizationId: context.organizationId, isActive: true } });
    if (!role || !location) fail("NOT_FOUND");
    const existing = await database.employeeProductionRole.findFirst({ where: { organizationId: context.organizationId, employeeId: command.employeeId, productionRoleId: command.productionRoleId } });
    await database.employeeProductionRole.upsert({ where: { employeeId_productionRoleId: { employeeId: command.employeeId, productionRoleId: command.productionRoleId } }, create: { organizationId: context.organizationId, ...command }, update: { handlingLocationId: command.handlingLocationId } });
    await audit(database, context, "employee.production_role_assigned", "EmployeeProfile", command.employeeId, existing ? { roleId: existing.productionRoleId, locationId: existing.handlingLocationId } : undefined, { roleId: command.productionRoleId, locationId: command.handlingLocationId });
  });
}

const referenceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("department"), code, name }),
  z.object({ kind: z.literal("location"), code, name, type: z.enum(LocationType), departmentId: uuid.optional() }),
  z.object({ kind: z.literal("productionRole"), code, name }),
  z.object({ kind: z.literal("productType"), code, name }),
  z.object({ kind: z.literal("customer"), name }),
  z.object({ kind: z.literal("order"), orderNumber: code, customerId: uuid.optional() }),
]);
export async function createReference(input: unknown) {
  const command = parse(referenceSchema, input);
  const permission = command.kind === "department" || command.kind === "location" ? "locations.manage" : command.kind === "productionRole" ? "production_roles.manage" : "products.create";
  const { context } = await authorize(permission);
  return prisma.$transaction(async database => {
    let record: { id: string };
    switch (command.kind) {
      case "department": record = await database.department.create({ data: { organizationId: context.organizationId, code: command.code, name: command.name }, select: { id: true } }); break;
      case "location":
        if (command.departmentId && !await database.department.findFirst({ where: { id: command.departmentId, organizationId: context.organizationId, isActive: true } })) fail("NOT_FOUND");
        record = await database.location.create({ data: { organizationId: context.organizationId, code: command.code, name: command.name, type: command.type, departmentId: command.departmentId }, select: { id: true } }); break;
      case "productionRole": record = await database.productionRole.create({ data: { organizationId: context.organizationId, code: command.code, name: command.name }, select: { id: true } }); break;
      case "productType": record = await database.productType.create({ data: { organizationId: context.organizationId, code: command.code, name: command.name }, select: { id: true } }); break;
      case "customer": record = await database.customer.create({ data: { organizationId: context.organizationId, name: command.name }, select: { id: true } }); break;
      case "order":
        if (command.customerId && !await database.customer.findFirst({ where: { id: command.customerId, organizationId: context.organizationId } })) fail("NOT_FOUND");
        record = await database.productionOrder.create({ data: { organizationId: context.organizationId, orderNumber: command.orderNumber, customerId: command.customerId, status: "OPEN" }, select: { id: true } }); break;
    }
    await audit(database, context, command.kind + ".created", command.kind, record.id, undefined, command);
    return record;
  });
}

export async function getFactorySetup() {
  const context = await requireAnyPermission(["users.manage", "access_roles.manage", "production_roles.manage", "locations.manage", "products.create"]);
  const permissions = await getPermissionsForMembership(context);
  const where = { organizationId: context.organizationId };
  const [members, roles, productionRoles, locations, departments, customers, orders, productTypes] = await Promise.all([
    permissions.has("users.manage") ? prisma.membership.findMany({ where, orderBy: { createdAt: "desc" }, take: 500, select: { id: true, status: true, user: { select: { username: true } }, employeeProfile: { select: { id: true, displayName: true, productionRoleLinks: { select: { productionRole: { select: { name: true } }, handlingLocation: { select: { name: true } } } } } }, accessRoleLinks: { select: { accessRoleId: true } } } }) : [],
    permissions.has("access_roles.manage") ? prisma.accessRole.findMany({ where, select: { id: true, code: true, name: true, permissionLinks: { select: { permission: { select: { code: true } } } }, membershipLinks: { where: { membershipId: context.membershipId }, select: { membershipId: true } } } }) : [],
    prisma.productionRole.findMany({ where, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.location.findMany({ where, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.department.findMany({ where, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    permissions.has("products.create") ? prisma.customer.findMany({ where, select: { id: true, name: true }, orderBy: { name: "asc" } }) : [],
    permissions.has("products.create") ? prisma.productionOrder.findMany({ where, select: { id: true, orderNumber: true }, orderBy: { createdAt: "desc" }, take: 500 }) : [],
    permissions.has("products.create") ? prisma.productType.findMany({ where, select: { id: true, name: true }, orderBy: { name: "asc" } }) : [],
  ]);
  return { membershipId: context.membershipId, permissions: [...permissions], members: members.map(m => ({ id: m.id, active: m.status === "ACTIVE", username: m.user.username, employeeId: m.employeeProfile?.id ?? null, displayName: m.employeeProfile?.displayName ?? null, productionAssignments: m.employeeProfile?.productionRoleLinks.map(r => ({ role: r.productionRole.name, location: r.handlingLocation?.name ?? null })) ?? [], accessRoleIds: m.accessRoleLinks.map(r => r.accessRoleId) })),
    roles: roles.map(r => ({ id: r.id, code: r.code, name: r.name, permissions: r.permissionLinks.map(p => p.permission.code), isOwn: Boolean(r.membershipLinks.length) })), productionRoles, locations, departments, customers, orders, productTypes };
}

