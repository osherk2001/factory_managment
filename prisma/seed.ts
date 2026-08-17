import "dotenv/config";

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { LocationType, PrismaClient } from "@prisma/client";

export const DEVELOPMENT_ORGANIZATION = {
  name: "FactoryFlow Development Factory",
  slug: "factoryflow-dev",
} as const;

export const DEVELOPMENT_ORGANIZATION_SLUG = DEVELOPMENT_ORGANIZATION.slug;

export const PERMISSION_CODES = [
  "products.create",
  "products.read",
  "products.update",
  "products.complete",
  "products.reopen",
  "products.cancel",
  "products.restore",
  "products.trash",
  "barcodes.print",
  "barcodes.reprint",
  "scans.perform",
  "scans.takeover",
  "locations.transfer",
  "issues.create",
  "issues.read",
  "issues.resolve",
  "weights.read",
  "weights.create",
  "weights.correct",
  "users.manage",
  "access_roles.manage",
  "permissions.manage",
  "production_roles.manage",
  "locations.manage",
  "workflows.manage",
  "audit.read",
  "reports.export",
] as const;

type PermissionCode = (typeof PERMISSION_CODES)[number];
type AccessRoleCode =
  | "FACTORY_ADMIN"
  | "PRODUCTION_MANAGER"
  | "WORKER"
  | "QUALITY_CONTROL"
  | "VIEWER";

const FIXTURE_IDS = {
  organization: "00000000-0000-4000-8000-000000000001",
  users: {
    admin: "00000000-0000-4000-8000-000000000011",
    manager: "00000000-0000-4000-8000-000000000012",
    worker1: "00000000-0000-4000-8000-000000000013",
    worker2: "00000000-0000-4000-8000-000000000014",
    qc: "00000000-0000-4000-8000-000000000015",
    viewer: "00000000-0000-4000-8000-000000000016",
  },
  memberships: {
    admin: "00000000-0000-4000-8000-000000000021",
    manager: "00000000-0000-4000-8000-000000000022",
    worker1: "00000000-0000-4000-8000-000000000023",
    worker2: "00000000-0000-4000-8000-000000000024",
    qc: "00000000-0000-4000-8000-000000000025",
    viewer: "00000000-0000-4000-8000-000000000026",
  },
  accessRoles: {
    factoryAdmin: "00000000-0000-4000-8000-000000000031",
    productionManager: "00000000-0000-4000-8000-000000000032",
    worker: "00000000-0000-4000-8000-000000000033",
    qualityControl: "00000000-0000-4000-8000-000000000034",
    viewer: "00000000-0000-4000-8000-000000000035",
  },
  permissions: {
    productsCreate: "00000000-0000-4000-8000-000000000041",
    productsRead: "00000000-0000-4000-8000-000000000042",
    productsUpdate: "00000000-0000-4000-8000-000000000043",
    productsComplete: "00000000-0000-4000-8000-000000000044",
    productsReopen: "00000000-0000-4000-8000-000000000045",
    productsCancel: "00000000-0000-4000-8000-000000000046",
    productsRestore: "00000000-0000-4000-8000-000000000047",
    productsTrash: "00000000-0000-4000-8000-000000000048",
    barcodesPrint: "00000000-0000-4000-8000-000000000049",
    barcodesReprint: "00000000-0000-4000-8000-000000000050",
    scansPerform: "00000000-0000-4000-8000-000000000051",
    scansTakeover: "00000000-0000-4000-8000-000000000052",
    locationsTransfer: "00000000-0000-4000-8000-000000000053",
    issuesCreate: "00000000-0000-4000-8000-000000000054",
    issuesRead: "00000000-0000-4000-8000-000000000055",
    issuesResolve: "00000000-0000-4000-8000-000000000056",
    weightsRead: "00000000-0000-4000-8000-000000000057",
    weightsCreate: "00000000-0000-4000-8000-000000000058",
    weightsCorrect: "00000000-0000-4000-8000-000000000059",
    usersManage: "00000000-0000-4000-8000-000000000060",
    accessRolesManage: "00000000-0000-4000-8000-000000000061",
    permissionsManage: "00000000-0000-4000-8000-000000000062",
    productionRolesManage: "00000000-0000-4000-8000-000000000063",
    locationsManage: "00000000-0000-4000-8000-000000000064",
    workflowsManage: "00000000-0000-4000-8000-000000000065",
    auditRead: "00000000-0000-4000-8000-000000000066",
    reportsExport: "00000000-0000-4000-8000-000000000067",
  },
  productionRoles: {
    polisher: "00000000-0000-4000-8000-000000000071",
    stoneSetter: "00000000-0000-4000-8000-000000000072",
    cleaner: "00000000-0000-4000-8000-000000000073",
    qualityInspector: "00000000-0000-4000-8000-000000000074",
  },
  employeeProfiles: {
    manager: "00000000-0000-4000-8000-000000000081",
    worker1: "00000000-0000-4000-8000-000000000082",
    worker2: "00000000-0000-4000-8000-000000000083",
    qc: "00000000-0000-4000-8000-000000000084",
  },
  departments: {
    polishing: "00000000-0000-4000-8000-000000000091",
    stoneSetting: "00000000-0000-4000-8000-000000000092",
    cleaning: "00000000-0000-4000-8000-000000000093",
    qualityControl: "00000000-0000-4000-8000-000000000094",
  },
  locations: {
    polishing: "00000000-0000-4000-8000-000000000101",
    stoneSetting: "00000000-0000-4000-8000-000000000102",
    cleaning: "00000000-0000-4000-8000-000000000103",
    qualityControl: "00000000-0000-4000-8000-000000000104",
    safe: "00000000-0000-4000-8000-000000000105",
    waiting: "00000000-0000-4000-8000-000000000106",
  },
} as const;

const USER_FIXTURES = [
  {
    key: "admin",
    id: FIXTURE_IDS.users.admin,
    membershipId: FIXTURE_IDS.memberships.admin,
    email: "admin@factoryflow.example.test",
    username: "factoryflow-admin",
  },
  {
    key: "manager",
    id: FIXTURE_IDS.users.manager,
    membershipId: FIXTURE_IDS.memberships.manager,
    email: "manager@factoryflow.example.test",
    username: "factoryflow-manager",
  },
  {
    key: "worker1",
    id: FIXTURE_IDS.users.worker1,
    membershipId: FIXTURE_IDS.memberships.worker1,
    email: "worker1@factoryflow.example.test",
    username: "factoryflow-worker1",
  },
  {
    key: "worker2",
    id: FIXTURE_IDS.users.worker2,
    membershipId: FIXTURE_IDS.memberships.worker2,
    email: "worker2@factoryflow.example.test",
    username: "factoryflow-worker2",
  },
  {
    key: "qc",
    id: FIXTURE_IDS.users.qc,
    membershipId: FIXTURE_IDS.memberships.qc,
    email: "qc@factoryflow.example.test",
    username: "factoryflow-qc",
  },
  {
    key: "viewer",
    id: FIXTURE_IDS.users.viewer,
    membershipId: FIXTURE_IDS.memberships.viewer,
    email: "viewer@factoryflow.example.test",
    username: "factoryflow-viewer",
  },
] as const;

export const DEVELOPMENT_USER_IDS = USER_FIXTURES.map((user) => user.id);

const ACCESS_ROLE_FIXTURES = [
  {
    id: FIXTURE_IDS.accessRoles.factoryAdmin,
    code: "FACTORY_ADMIN",
    name: "Factory Administrator",
  },
  {
    id: FIXTURE_IDS.accessRoles.productionManager,
    code: "PRODUCTION_MANAGER",
    name: "Production Manager",
  },
  {
    id: FIXTURE_IDS.accessRoles.worker,
    code: "WORKER",
    name: "Worker",
  },
  {
    id: FIXTURE_IDS.accessRoles.qualityControl,
    code: "QUALITY_CONTROL",
    name: "Quality Control",
  },
  {
    id: FIXTURE_IDS.accessRoles.viewer,
    code: "VIEWER",
    name: "Viewer",
  },
] as const satisfies ReadonlyArray<{
  id: string;
  code: AccessRoleCode;
  name: string;
}>;

const PERMISSION_FIXTURES = [
  [
    "products.create",
    "Create products",
    FIXTURE_IDS.permissions.productsCreate,
  ],
  ["products.read", "Read products", FIXTURE_IDS.permissions.productsRead],
  [
    "products.update",
    "Update products",
    FIXTURE_IDS.permissions.productsUpdate,
  ],
  [
    "products.complete",
    "Complete products",
    FIXTURE_IDS.permissions.productsComplete,
  ],
  [
    "products.reopen",
    "Reopen products",
    FIXTURE_IDS.permissions.productsReopen,
  ],
  [
    "products.cancel",
    "Cancel products",
    FIXTURE_IDS.permissions.productsCancel,
  ],
  [
    "products.restore",
    "Restore cancelled products",
    FIXTURE_IDS.permissions.productsRestore,
  ],
  [
    "products.trash",
    "Move products to trash",
    FIXTURE_IDS.permissions.productsTrash,
  ],
  [
    "barcodes.print",
    "Print product barcodes",
    FIXTURE_IDS.permissions.barcodesPrint,
  ],
  [
    "barcodes.reprint",
    "Reprint product barcodes",
    FIXTURE_IDS.permissions.barcodesReprint,
  ],
  [
    "scans.perform",
    "Perform product scans",
    FIXTURE_IDS.permissions.scansPerform,
  ],
  [
    "scans.takeover",
    "Take over active products",
    FIXTURE_IDS.permissions.scansTakeover,
  ],
  [
    "locations.transfer",
    "Transfer products between locations",
    FIXTURE_IDS.permissions.locationsTransfer,
  ],
  [
    "issues.create",
    "Create production issues",
    FIXTURE_IDS.permissions.issuesCreate,
  ],
  ["issues.read", "Read production issues", FIXTURE_IDS.permissions.issuesRead],
  [
    "issues.resolve",
    "Resolve production issues",
    FIXTURE_IDS.permissions.issuesResolve,
  ],
  ["weights.read", "Read weight events", FIXTURE_IDS.permissions.weightsRead],
  [
    "weights.create",
    "Record weight events",
    FIXTURE_IDS.permissions.weightsCreate,
  ],
  [
    "weights.correct",
    "Correct weight events",
    FIXTURE_IDS.permissions.weightsCorrect,
  ],
  ["users.manage", "Manage users", FIXTURE_IDS.permissions.usersManage],
  [
    "access_roles.manage",
    "Manage access roles",
    FIXTURE_IDS.permissions.accessRolesManage,
  ],
  [
    "permissions.manage",
    "Manage permissions",
    FIXTURE_IDS.permissions.permissionsManage,
  ],
  [
    "production_roles.manage",
    "Manage production roles",
    FIXTURE_IDS.permissions.productionRolesManage,
  ],
  [
    "locations.manage",
    "Manage locations",
    FIXTURE_IDS.permissions.locationsManage,
  ],
  [
    "workflows.manage",
    "Manage workflows",
    FIXTURE_IDS.permissions.workflowsManage,
  ],
  ["audit.read", "Read audit history", FIXTURE_IDS.permissions.auditRead],
  ["reports.export", "Export reports", FIXTURE_IDS.permissions.reportsExport],
] as const satisfies ReadonlyArray<readonly [PermissionCode, string, string]>;

const ROLE_PERMISSIONS = {
  FACTORY_ADMIN: PERMISSION_CODES,
  PRODUCTION_MANAGER: [
    "products.create",
    "products.read",
    "products.update",
    "products.complete",
    "products.reopen",
    "products.cancel",
    "products.restore",
    "products.trash",
    "barcodes.print",
    "barcodes.reprint",
    "scans.perform",
    "scans.takeover",
    "locations.transfer",
    "issues.create",
    "issues.read",
    "issues.resolve",
    "weights.read",
    "weights.create",
    "weights.correct",
    "production_roles.manage",
    "locations.manage",
    "workflows.manage",
    "audit.read",
    "reports.export",
  ],
  WORKER: [
    "products.read",
    "scans.perform",
    "scans.takeover",
    "issues.create",
    "issues.read",
    "weights.read",
    "weights.create",
  ],
  QUALITY_CONTROL: [
    "products.read",
    "scans.perform",
    "issues.create",
    "issues.read",
    "issues.resolve",
    "weights.read",
  ],
  VIEWER: ["products.read", "issues.read", "weights.read", "audit.read"],
} as const satisfies Record<AccessRoleCode, readonly PermissionCode[]>;

const ACCESS_ROLE_ASSIGNMENTS = [
  ["admin", "FACTORY_ADMIN"],
  ["manager", "PRODUCTION_MANAGER"],
  ["worker1", "WORKER"],
  ["worker2", "WORKER"],
  ["qc", "QUALITY_CONTROL"],
  ["viewer", "VIEWER"],
] as const satisfies ReadonlyArray<readonly [string, AccessRoleCode]>;

const PRODUCTION_ROLE_FIXTURES = [
  {
    id: FIXTURE_IDS.productionRoles.polisher,
    code: "POLISHER",
    name: "Polisher",
  },
  {
    id: FIXTURE_IDS.productionRoles.stoneSetter,
    code: "STONE_SETTER",
    name: "Stone Setter",
  },
  {
    id: FIXTURE_IDS.productionRoles.cleaner,
    code: "CLEANER",
    name: "Cleaner",
  },
  {
    id: FIXTURE_IDS.productionRoles.qualityInspector,
    code: "QUALITY_INSPECTOR",
    name: "Quality Inspector",
  },
] as const;

const EMPLOYEE_FIXTURES = [
  {
    key: "manager",
    id: FIXTURE_IDS.employeeProfiles.manager,
    membershipKey: "manager",
    displayName: "Development Manager",
  },
  {
    key: "worker1",
    id: FIXTURE_IDS.employeeProfiles.worker1,
    membershipKey: "worker1",
    displayName: "Development Worker One",
  },
  {
    key: "worker2",
    id: FIXTURE_IDS.employeeProfiles.worker2,
    membershipKey: "worker2",
    displayName: "Development Worker Two",
  },
  {
    key: "qc",
    id: FIXTURE_IDS.employeeProfiles.qc,
    membershipKey: "qc",
    displayName: "Development Quality Inspector",
  },
] as const;

export const DEVELOPMENT_EMPLOYEE_PROFILE_IDS = EMPLOYEE_FIXTURES.map(
  (employee) => employee.id,
);

const EMPLOYEE_PRODUCTION_ROLES = [
  ["worker1", "POLISHER"],
  ["worker2", "POLISHER"],
  ["worker2", "STONE_SETTER"],
  ["qc", "QUALITY_INSPECTOR"],
] as const;

const DEPARTMENT_FIXTURES = [
  {
    id: FIXTURE_IDS.departments.polishing,
    code: "POLISHING",
    name: "Polishing",
  },
  {
    id: FIXTURE_IDS.departments.stoneSetting,
    code: "STONE_SETTING",
    name: "Stone Setting",
  },
  {
    id: FIXTURE_IDS.departments.cleaning,
    code: "CLEANING",
    name: "Cleaning",
  },
  {
    id: FIXTURE_IDS.departments.qualityControl,
    code: "QUALITY_CONTROL",
    name: "Quality Control",
  },
] as const;

const LOCATION_FIXTURES = [
  {
    id: FIXTURE_IDS.locations.polishing,
    code: "POLISHING_WORK_AREA",
    name: "Polishing Work Area",
    type: LocationType.WORK_AREA,
    departmentCode: "POLISHING",
  },
  {
    id: FIXTURE_IDS.locations.stoneSetting,
    code: "STONE_SETTING_WORK_AREA",
    name: "Stone Setting Work Area",
    type: LocationType.WORK_AREA,
    departmentCode: "STONE_SETTING",
  },
  {
    id: FIXTURE_IDS.locations.cleaning,
    code: "CLEANING_WORK_AREA",
    name: "Cleaning Work Area",
    type: LocationType.WORK_AREA,
    departmentCode: "CLEANING",
  },
  {
    id: FIXTURE_IDS.locations.qualityControl,
    code: "QUALITY_CONTROL_WORK_AREA",
    name: "Quality Control Work Area",
    type: LocationType.WORK_AREA,
    departmentCode: "QUALITY_CONTROL",
  },
  {
    id: FIXTURE_IDS.locations.safe,
    code: "MAIN_SAFE",
    name: "Main Safe",
    type: LocationType.SAFE,
    departmentCode: null,
  },
  {
    id: FIXTURE_IDS.locations.waiting,
    code: "WAITING_AREA",
    name: "Waiting Area",
    type: LocationType.WAITING,
    departmentCode: null,
  },
] as const;

export type DevelopmentSeedSummary = {
  organization: number;
  users: number;
  memberships: number;
  accessRoles: number;
  permissions: number;
  accessRolePermissions: number;
  membershipAccessRoles: number;
  employeeProfiles: number;
  productionRoles: number;
  employeeProductionRoles: number;
  departments: number;
  locations: number;
};

function assertDevelopmentSeedEnvironment() {
  if (
    process.env.NODE_ENV === "production" ||
    process.env.SEED_ENV !== "development"
  ) {
    throw new Error(
      "Development seed refused. Set SEED_ENV=development and do not run it in production.",
    );
  }
}

export async function seedDevelopmentFixtures(
  client: PrismaClient,
): Promise<DevelopmentSeedSummary> {
  return client.$transaction(async (tx) => {
    const organization = await tx.organization.upsert({
      where: { slug: DEVELOPMENT_ORGANIZATION_SLUG },
      update: { name: DEVELOPMENT_ORGANIZATION.name },
      create: {
        id: FIXTURE_IDS.organization,
        name: DEVELOPMENT_ORGANIZATION.name,
        slug: DEVELOPMENT_ORGANIZATION_SLUG,
      },
    });

    const membershipsByUserKey = new Map<string, { id: string }>();
    for (const userFixture of USER_FIXTURES) {
      await tx.user.upsert({
        where: { id: userFixture.id },
        update: {
          username: userFixture.username,
          email: userFixture.email,
          passwordHash: null,
          isActive: true,
          isSystemAdmin: false,
        },
        create: {
          id: userFixture.id,
          username: userFixture.username,
          email: userFixture.email,
          passwordHash: null,
          isActive: true,
          isSystemAdmin: false,
        },
      });

      const membership = await tx.membership.upsert({
        where: {
          organizationId_userId: {
            organizationId: organization.id,
            userId: userFixture.id,
          },
        },
        update: { status: "ACTIVE" },
        create: {
          id: userFixture.membershipId,
          organizationId: organization.id,
          userId: userFixture.id,
          status: "ACTIVE",
        },
      });
      membershipsByUserKey.set(userFixture.key, membership);
    }

    const permissionsByCode = new Map<PermissionCode, { id: string }>();
    for (const [code, description, id] of PERMISSION_FIXTURES) {
      const permission = await tx.permission.upsert({
        where: { code },
        update: { description },
        create: {
          id,
          code,
          description,
        },
      });
      permissionsByCode.set(code, permission);
    }

    const accessRolesByCode = new Map<AccessRoleCode, { id: string }>();
    for (const roleFixture of ACCESS_ROLE_FIXTURES) {
      const role = await tx.accessRole.upsert({
        where: {
          organizationId_code: {
            organizationId: organization.id,
            code: roleFixture.code,
          },
        },
        update: {
          name: roleFixture.name,
          isSystemDefined: false,
        },
        create: {
          id: roleFixture.id,
          organizationId: organization.id,
          code: roleFixture.code,
          name: roleFixture.name,
          isSystemDefined: false,
        },
      });
      accessRolesByCode.set(roleFixture.code, role);
    }

    let accessRolePermissions = 0;
    for (const roleFixture of ACCESS_ROLE_FIXTURES) {
      const accessRole = accessRolesByCode.get(roleFixture.code);
      if (!accessRole) {
        throw new Error(`Missing seeded access role: ${roleFixture.code}`);
      }
      for (const permissionCode of ROLE_PERMISSIONS[roleFixture.code]) {
        const permission = permissionsByCode.get(permissionCode);
        if (!permission) {
          throw new Error(`Missing seeded permission: ${permissionCode}`);
        }
        await tx.accessRolePermission.upsert({
          where: {
            accessRoleId_permissionId: {
              accessRoleId: accessRole.id,
              permissionId: permission.id,
            },
          },
          update: {},
          create: {
            accessRoleId: accessRole.id,
            permissionId: permission.id,
          },
        });
        accessRolePermissions += 1;
      }
    }

    let membershipAccessRoles = 0;
    for (const [userKey, roleCode] of ACCESS_ROLE_ASSIGNMENTS) {
      const membership = membershipsByUserKey.get(userKey);
      const accessRole = accessRolesByCode.get(roleCode);
      if (!membership || !accessRole) {
        throw new Error(`Missing membership or access role for ${userKey}`);
      }
      await tx.membershipAccessRole.upsert({
        where: {
          membershipId_accessRoleId: {
            membershipId: membership.id,
            accessRoleId: accessRole.id,
          },
        },
        update: { organizationId: organization.id },
        create: {
          organizationId: organization.id,
          membershipId: membership.id,
          accessRoleId: accessRole.id,
        },
      });
      membershipAccessRoles += 1;
    }

    const employeeProfilesByKey = new Map<string, { id: string }>();
    for (const employeeFixture of EMPLOYEE_FIXTURES) {
      const membership = membershipsByUserKey.get(
        employeeFixture.membershipKey,
      );
      if (!membership) {
        throw new Error(
          `Missing membership for employee ${employeeFixture.displayName}`,
        );
      }
      const employeeProfile = await tx.employeeProfile.upsert({
        where: {
          organizationId_membershipId: {
            organizationId: organization.id,
            membershipId: membership.id,
          },
        },
        update: {
          displayName: employeeFixture.displayName,
          isActive: true,
        },
        create: {
          id: employeeFixture.id,
          organizationId: organization.id,
          membershipId: membership.id,
          displayName: employeeFixture.displayName,
          isActive: true,
        },
      });
      employeeProfilesByKey.set(employeeFixture.key, employeeProfile);
    }

    const productionRolesByCode = new Map<string, { id: string }>();
    for (const roleFixture of PRODUCTION_ROLE_FIXTURES) {
      const productionRole = await tx.productionRole.upsert({
        where: {
          organizationId_code: {
            organizationId: organization.id,
            code: roleFixture.code,
          },
        },
        update: { name: roleFixture.name, isActive: true },
        create: {
          id: roleFixture.id,
          organizationId: organization.id,
          code: roleFixture.code,
          name: roleFixture.name,
          isActive: true,
        },
      });
      productionRolesByCode.set(roleFixture.code, productionRole);
    }

    const departmentsByCode = new Map<string, { id: string }>();
    for (const departmentFixture of DEPARTMENT_FIXTURES) {
      const department = await tx.department.upsert({
        where: {
          organizationId_code: {
            organizationId: organization.id,
            code: departmentFixture.code,
          },
        },
        update: { name: departmentFixture.name, isActive: true },
        create: {
          id: departmentFixture.id,
          organizationId: organization.id,
          code: departmentFixture.code,
          name: departmentFixture.name,
          isActive: true,
        },
      });
      departmentsByCode.set(departmentFixture.code, department);
    }

    for (const locationFixture of LOCATION_FIXTURES) {
      const department = locationFixture.departmentCode
        ? departmentsByCode.get(locationFixture.departmentCode)
        : null;
      if (locationFixture.departmentCode && !department) {
        throw new Error(
          `Missing department for location ${locationFixture.code}`,
        );
      }
      await tx.location.upsert({
        where: {
          organizationId_code: {
            organizationId: organization.id,
            code: locationFixture.code,
          },
        },
        update: {
          name: locationFixture.name,
          type: locationFixture.type,
          departmentId: department?.id ?? null,
          isActive: true,
        },
        create: {
          id: locationFixture.id,
          organizationId: organization.id,
          departmentId: department?.id ?? null,
          code: locationFixture.code,
          name: locationFixture.name,
          type: locationFixture.type,
          isActive: true,
        },
      });
    }

    const locationsByCode = new Map<string, { id: string }>();
    for (const locationFixture of LOCATION_FIXTURES) {
      const location = await tx.location.findUniqueOrThrow({
        where: {
          organizationId_code: {
            organizationId: organization.id,
            code: locationFixture.code,
          },
        },
        select: { id: true },
      });
      locationsByCode.set(locationFixture.code, location);
    }

    const handlingLocationByAssignment = new Map<
      string,
      { employeeKey: string; productionRoleCode: string; locationCode: string }
    >([
      [
        "worker1/POLISHER",
        {
          employeeKey: "worker1",
          productionRoleCode: "POLISHER",
          locationCode: "POLISHING_WORK_AREA",
        },
      ],
      [
        "worker2/POLISHER",
        {
          employeeKey: "worker2",
          productionRoleCode: "POLISHER",
          locationCode: "POLISHING_WORK_AREA",
        },
      ],
      [
        "worker2/STONE_SETTER",
        {
          employeeKey: "worker2",
          productionRoleCode: "STONE_SETTER",
          locationCode: "STONE_SETTING_WORK_AREA",
        },
      ],
      [
        "qc/QUALITY_INSPECTOR",
        {
          employeeKey: "qc",
          productionRoleCode: "QUALITY_INSPECTOR",
          locationCode: "QUALITY_CONTROL_WORK_AREA",
        },
      ],
    ]);

    let employeeProductionRoles = 0;
    for (const [employeeKey, productionRoleCode] of EMPLOYEE_PRODUCTION_ROLES) {
      const employee = employeeProfilesByKey.get(employeeKey);
      const productionRole = productionRolesByCode.get(productionRoleCode);
      const assignment = handlingLocationByAssignment.get(
        `${employeeKey}/${productionRoleCode}`,
      );
      const location = assignment
        ? locationsByCode.get(assignment.locationCode)
        : undefined;
      if (!employee || !productionRole || !location) {
        throw new Error(
          `Missing employee, production role, or handling location for ${employeeKey}/${productionRoleCode}`,
        );
      }
      await tx.employeeProductionRole.upsert({
        where: {
          employeeId_productionRoleId: {
            employeeId: employee.id,
            productionRoleId: productionRole.id,
          },
        },
        update: {
          organizationId: organization.id,
          handlingLocationId: location.id,
        },
        create: {
          organizationId: organization.id,
          employeeId: employee.id,
          productionRoleId: productionRole.id,
          handlingLocationId: location.id,
        },
      });
      employeeProductionRoles += 1;
    }

    return {
      organization: 1,
      users: USER_FIXTURES.length,
      memberships: USER_FIXTURES.length,
      accessRoles: ACCESS_ROLE_FIXTURES.length,
      permissions: PERMISSION_FIXTURES.length,
      accessRolePermissions,
      membershipAccessRoles,
      employeeProfiles: EMPLOYEE_FIXTURES.length,
      productionRoles: PRODUCTION_ROLE_FIXTURES.length,
      employeeProductionRoles,
      departments: DEPARTMENT_FIXTURES.length,
      locations: LOCATION_FIXTURES.length,
    };
  });
}

async function main() {
  let client: PrismaClient | undefined;

  try {
    assertDevelopmentSeedEnvironment();
    client = new PrismaClient();
    const summary = await seedDevelopmentFixtures(client);
    process.stdout.write(
      [
        "FactoryFlow development fixtures seeded.",
        `organization=${summary.organization}`,
        `users=${summary.users}`,
        `memberships=${summary.memberships}`,
        `accessRoles=${summary.accessRoles}`,
        `permissions=${summary.permissions}`,
        `accessRolePermissions=${summary.accessRolePermissions}`,
        `membershipAccessRoles=${summary.membershipAccessRoles}`,
        `employeeProfiles=${summary.employeeProfiles}`,
        `productionRoles=${summary.productionRoles}`,
        `employeeProductionRoles=${summary.employeeProductionRoles}`,
        `departments=${summary.departments}`,
        `locations=${summary.locations}`,
      ].join(" ") + "\n",
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Development seed failed: ${message}\n`);
    process.exitCode = 1;
  } finally {
    await client?.$disconnect();
  }
}

const isDirectExecution =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  void main();
}
