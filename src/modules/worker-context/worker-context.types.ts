export type EmployeeContext = {
  userId: string;
  membershipId: string;
  organizationId: string;
  organizationName: string;
  employeeId: string;
  displayName: string;
};

export type ProductionRoleOptionDto = {
  id: string;
  code: string;
  name: string;
};

export type ActiveProductionRoleSource = "persisted" | "automatic";

export type WorkerProductionRoleState =
  | {
      kind: "NO_PRODUCTION_ROLES";
      availableRoles: readonly [];
      activeProductionRole: null;
      activeProductionRoleSource: null;
    }
  | {
      kind: "ACTIVE_PRODUCTION_ROLE_REQUIRED";
      availableRoles: readonly ProductionRoleOptionDto[];
      activeProductionRole: null;
      activeProductionRoleSource: null;
    }
  | {
      kind: "READY";
      availableRoles: readonly ProductionRoleOptionDto[];
      activeProductionRole: ProductionRoleOptionDto;
      activeProductionRoleSource: ActiveProductionRoleSource;
    };

export type WorkerProductDto = {
  id: string;
  serialNumber: string;
  status: "IN_PROGRESS";
  version: number;
  isUrgent: boolean;
  targetAt: string | null;
  productionOrder: {
    id: string;
    orderNumber: string;
  } | null;
  productType: {
    id: string;
    code: string;
    name: string;
  } | null;
  currentRole: ProductionRoleOptionDto | null;
  currentLocation: {
    id: string;
    code: string;
    name: string;
  } | null;
  workflow: {
    templateName: string | null;
    currentStage: {
      id: string;
      code: string;
      name: string;
      position: number;
    } | null;
    expectedNextStage: {
      id: string;
      code: string;
      name: string;
      position: number;
    } | null;
    deviation: boolean;
  } | null;
};

export type WorkerHomeData = {
  employee: EmployeeContext;
  productionRoleState: WorkerProductionRoleState;
  products: readonly WorkerProductDto[];
};
