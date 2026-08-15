-- CreateEnum
CREATE TYPE "ProductStatus" AS ENUM ('CREATED', 'IN_PROGRESS', 'READY_FOR_HANDOFF', 'COMPLETED', 'CANCELLED', 'TRASHED');

-- CreateEnum
CREATE TYPE "LocationType" AS ENUM ('DEPARTMENT', 'WORK_AREA', 'SAFE', 'STORAGE', 'WAITING', 'EXTERNAL', 'OTHER');

-- CreateEnum
CREATE TYPE "IssueStatus" AS ENUM ('OPEN', 'RESOLVED');

-- CreateEnum
CREATE TYPE "WeightEventType" AS ENUM ('EXPECTED', 'ISSUED', 'FINAL', 'RETURNED', 'APPROVED_LOSS', 'CORRECTION');

-- CreateEnum
CREATE TYPE "AssignmentEndReason" AS ENUM ('FINISHED', 'TAKEN_OVER', 'CANCELLED', 'COMPLETED', 'MANUAL_TRANSFER');

-- CreateEnum
CREATE TYPE "ProductTransitionEventType" AS ENUM ('PRODUCT_CREATED', 'PRODUCT_RECEIVED', 'WORK_FINISHED', 'RESPONSIBILITY_TAKEN_OVER', 'PRODUCT_COMPLETED', 'PRODUCT_RETURNED_TO_PROCESS', 'PRODUCT_CANCELLED', 'PRODUCT_RESTORED', 'PRODUCT_TRASHED', 'MANUAL_TRANSFER');

-- CreateTable
CREATE TABLE "Organization" (
    "id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "slug" VARCHAR(100) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "username" VARCHAR(100),
    "email" VARCHAR(320),
    "passwordHash" VARCHAR(255),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "status" VARCHAR(32) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccessRole" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "code" VARCHAR(100) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "isSystemDefined" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "AccessRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permission" (
    "id" UUID NOT NULL,
    "code" VARCHAR(100) NOT NULL,
    "description" VARCHAR(500),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccessRolePermission" (
    "accessRoleId" UUID NOT NULL,
    "permissionId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccessRolePermission_pkey" PRIMARY KEY ("accessRoleId","permissionId")
);

-- CreateTable
CREATE TABLE "MembershipAccessRole" (
    "organizationId" UUID NOT NULL,
    "membershipId" UUID NOT NULL,
    "accessRoleId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MembershipAccessRole_pkey" PRIMARY KEY ("membershipId","accessRoleId")
);

-- CreateTable
CREATE TABLE "EmployeeProfile" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "membershipId" UUID NOT NULL,
    "displayName" VARCHAR(200) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "EmployeeProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionRole" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "code" VARCHAR(100) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ProductionRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeProductionRole" (
    "organizationId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "productionRoleId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmployeeProductionRole_pkey" PRIMARY KEY ("employeeId","productionRoleId")
);

-- CreateTable
CREATE TABLE "Department" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "code" VARCHAR(100) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Location" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "departmentId" UUID,
    "code" VARCHAR(100) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "type" "LocationType" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "externalReference" VARCHAR(200),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionOrder" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "customerId" UUID,
    "orderNumber" VARCHAR(100) NOT NULL,
    "status" VARCHAR(50) NOT NULL,
    "commitmentAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ProductionOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductType" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "code" VARCHAR(100) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ProductType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "productionOrderId" UUID,
    "productTypeId" UUID,
    "serialNumber" VARCHAR(100) NOT NULL,
    "status" "ProductStatus" NOT NULL,
    "currentWorkerId" UUID,
    "currentRoleId" UUID,
    "currentLocationId" UUID,
    "currentStageId" UUID,
    "isUrgent" BOOLEAN NOT NULL DEFAULT false,
    "targetAt" TIMESTAMPTZ(6),
    "completedAt" TIMESTAMPTZ(6),
    "cancelledAt" TIMESTAMPTZ(6),
    "trashedAt" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Barcode" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "value" VARCHAR(255) NOT NULL,
    "format" VARCHAR(50),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastPrintedAt" TIMESTAMPTZ(6),

    CONSTRAINT "Barcode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowTemplate" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "version" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "WorkflowTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowTemplateStage" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "workflowTemplateId" UUID NOT NULL,
    "productionRoleId" UUID,
    "code" VARCHAR(100) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "position" INTEGER,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "WorkflowTemplateStage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowSnapshot" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "sourceTemplateId" UUID,
    "sourceVersion" INTEGER,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkflowSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowSnapshotStage" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "workflowSnapshotId" UUID NOT NULL,
    "productionRoleId" UUID,
    "sourceStageId" UUID,
    "code" VARCHAR(100) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "position" INTEGER,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkflowSnapshotStage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductAssignment" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "productionRoleId" UUID NOT NULL,
    "locationId" UUID,
    "workflowStageId" UUID,
    "startedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMPTZ(6),
    "endReason" "AssignmentEndReason",
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductTransition" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "actorUserId" UUID NOT NULL,
    "eventType" "ProductTransitionEventType" NOT NULL,
    "fromStatus" "ProductStatus",
    "toStatus" "ProductStatus",
    "fromWorkerId" UUID,
    "toWorkerId" UUID,
    "fromRoleId" UUID,
    "toRoleId" UUID,
    "fromLocationId" UUID,
    "toLocationId" UUID,
    "fromStageId" UUID,
    "toStageId" UUID,
    "reason" TEXT,
    "metadata" JSONB,
    "occurredAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductTransition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Issue" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "reportedByUserId" UUID NOT NULL,
    "resolvedByUserId" UUID,
    "type" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "status" "IssueStatus" NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMPTZ(6),

    CONSTRAINT "Issue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeightEvent" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "recordedByUserId" UUID NOT NULL,
    "employeeId" UUID,
    "productionRoleId" UUID,
    "type" "WeightEventType" NOT NULL,
    "grams" DECIMAL(10,3) NOT NULL,
    "note" TEXT,
    "occurredAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WeightEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "organizationId" UUID,
    "actorUserId" UUID,
    "action" VARCHAR(150) NOT NULL,
    "targetType" VARCHAR(100) NOT NULL,
    "targetId" UUID,
    "beforeData" JSONB,
    "afterData" JSONB,
    "metadata" JSONB,
    "occurredAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdempotencyKey" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "key" VARCHAR(255) NOT NULL,
    "operation" VARCHAR(150) NOT NULL,
    "requestHash" VARCHAR(128),
    "resultReference" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(6),

    CONSTRAINT "IdempotencyKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

-- CreateIndex
CREATE INDEX "Membership_userId_idx" ON "Membership"("userId");

-- CreateIndex
CREATE INDEX "Membership_organizationId_status_idx" ON "Membership"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_organizationId_userId_key" ON "Membership"("organizationId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_organizationId_id_key" ON "Membership"("organizationId", "id");

-- CreateIndex
CREATE INDEX "AccessRole_organizationId_idx" ON "AccessRole"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "AccessRole_organizationId_code_key" ON "AccessRole"("organizationId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "AccessRole_organizationId_id_key" ON "AccessRole"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_code_key" ON "Permission"("code");

-- CreateIndex
CREATE INDEX "AccessRolePermission_permissionId_idx" ON "AccessRolePermission"("permissionId");

-- CreateIndex
CREATE INDEX "MembershipAccessRole_organizationId_idx" ON "MembershipAccessRole"("organizationId");

-- CreateIndex
CREATE INDEX "MembershipAccessRole_accessRoleId_idx" ON "MembershipAccessRole"("accessRoleId");

-- CreateIndex
CREATE INDEX "EmployeeProfile_organizationId_isActive_idx" ON "EmployeeProfile"("organizationId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeProfile_organizationId_membershipId_key" ON "EmployeeProfile"("organizationId", "membershipId");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeProfile_organizationId_id_key" ON "EmployeeProfile"("organizationId", "id");

-- CreateIndex
CREATE INDEX "ProductionRole_organizationId_isActive_idx" ON "ProductionRole"("organizationId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "ProductionRole_organizationId_code_key" ON "ProductionRole"("organizationId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "ProductionRole_organizationId_id_key" ON "ProductionRole"("organizationId", "id");

-- CreateIndex
CREATE INDEX "EmployeeProductionRole_organizationId_idx" ON "EmployeeProductionRole"("organizationId");

-- CreateIndex
CREATE INDEX "EmployeeProductionRole_productionRoleId_idx" ON "EmployeeProductionRole"("productionRoleId");

-- CreateIndex
CREATE INDEX "Department_organizationId_isActive_idx" ON "Department"("organizationId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Department_organizationId_code_key" ON "Department"("organizationId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Department_organizationId_id_key" ON "Department"("organizationId", "id");

-- CreateIndex
CREATE INDEX "Location_organizationId_departmentId_idx" ON "Location"("organizationId", "departmentId");

-- CreateIndex
CREATE INDEX "Location_organizationId_type_isActive_idx" ON "Location"("organizationId", "type", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Location_organizationId_code_key" ON "Location"("organizationId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Location_organizationId_id_key" ON "Location"("organizationId", "id");

-- CreateIndex
CREATE INDEX "Customer_organizationId_name_idx" ON "Customer"("organizationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_organizationId_id_key" ON "Customer"("organizationId", "id");

-- CreateIndex
CREATE INDEX "ProductionOrder_organizationId_status_idx" ON "ProductionOrder"("organizationId", "status");

-- CreateIndex
CREATE INDEX "ProductionOrder_organizationId_customerId_idx" ON "ProductionOrder"("organizationId", "customerId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductionOrder_organizationId_orderNumber_key" ON "ProductionOrder"("organizationId", "orderNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ProductionOrder_organizationId_id_key" ON "ProductionOrder"("organizationId", "id");

-- CreateIndex
CREATE INDEX "ProductType_organizationId_isActive_idx" ON "ProductType"("organizationId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "ProductType_organizationId_code_key" ON "ProductType"("organizationId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "ProductType_organizationId_id_key" ON "ProductType"("organizationId", "id");

-- CreateIndex
CREATE INDEX "Product_organizationId_status_idx" ON "Product"("organizationId", "status");

-- CreateIndex
CREATE INDEX "Product_organizationId_currentWorkerId_status_idx" ON "Product"("organizationId", "currentWorkerId", "status");

-- CreateIndex
CREATE INDEX "Product_organizationId_currentRoleId_status_idx" ON "Product"("organizationId", "currentRoleId", "status");

-- CreateIndex
CREATE INDEX "Product_organizationId_currentLocationId_status_idx" ON "Product"("organizationId", "currentLocationId", "status");

-- CreateIndex
CREATE INDEX "Product_organizationId_targetAt_idx" ON "Product"("organizationId", "targetAt");

-- CreateIndex
CREATE INDEX "Product_organizationId_productionOrderId_idx" ON "Product"("organizationId", "productionOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "Product_organizationId_serialNumber_key" ON "Product"("organizationId", "serialNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Product_organizationId_id_key" ON "Product"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Barcode_productId_key" ON "Barcode"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "Barcode_value_key" ON "Barcode"("value");

-- CreateIndex
CREATE INDEX "Barcode_organizationId_productId_idx" ON "Barcode"("organizationId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "Barcode_organizationId_id_key" ON "Barcode"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Barcode_organizationId_productId_key" ON "Barcode"("organizationId", "productId");

-- CreateIndex
CREATE INDEX "WorkflowTemplate_organizationId_isActive_idx" ON "WorkflowTemplate"("organizationId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowTemplate_organizationId_name_version_key" ON "WorkflowTemplate"("organizationId", "name", "version");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowTemplate_organizationId_id_key" ON "WorkflowTemplate"("organizationId", "id");

-- CreateIndex
CREATE INDEX "WorkflowTemplateStage_organizationId_workflowTemplateId_pos_idx" ON "WorkflowTemplateStage"("organizationId", "workflowTemplateId", "position");

-- CreateIndex
CREATE INDEX "WorkflowTemplateStage_organizationId_productionRoleId_idx" ON "WorkflowTemplateStage"("organizationId", "productionRoleId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowTemplateStage_workflowTemplateId_code_key" ON "WorkflowTemplateStage"("workflowTemplateId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowTemplateStage_organizationId_id_key" ON "WorkflowTemplateStage"("organizationId", "id");

-- CreateIndex
CREATE INDEX "WorkflowSnapshot_organizationId_sourceTemplateId_idx" ON "WorkflowSnapshot"("organizationId", "sourceTemplateId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowSnapshot_productId_key" ON "WorkflowSnapshot"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowSnapshot_organizationId_productId_key" ON "WorkflowSnapshot"("organizationId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowSnapshot_organizationId_id_key" ON "WorkflowSnapshot"("organizationId", "id");

-- CreateIndex
CREATE INDEX "WorkflowSnapshotStage_organizationId_workflowSnapshotId_pos_idx" ON "WorkflowSnapshotStage"("organizationId", "workflowSnapshotId", "position");

-- CreateIndex
CREATE INDEX "WorkflowSnapshotStage_organizationId_productionRoleId_idx" ON "WorkflowSnapshotStage"("organizationId", "productionRoleId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowSnapshotStage_workflowSnapshotId_code_key" ON "WorkflowSnapshotStage"("workflowSnapshotId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowSnapshotStage_organizationId_id_key" ON "WorkflowSnapshotStage"("organizationId", "id");

-- CreateIndex
CREATE INDEX "ProductAssignment_organizationId_productId_startedAt_idx" ON "ProductAssignment"("organizationId", "productId", "startedAt");

-- CreateIndex
CREATE INDEX "ProductAssignment_organizationId_employeeId_endedAt_idx" ON "ProductAssignment"("organizationId", "employeeId", "endedAt");

-- CreateIndex
CREATE INDEX "ProductAssignment_organizationId_productionRoleId_endedAt_idx" ON "ProductAssignment"("organizationId", "productionRoleId", "endedAt");

-- CreateIndex
CREATE INDEX "ProductTransition_organizationId_productId_occurredAt_idx" ON "ProductTransition"("organizationId", "productId", "occurredAt");

-- CreateIndex
CREATE INDEX "ProductTransition_organizationId_actorUserId_occurredAt_idx" ON "ProductTransition"("organizationId", "actorUserId", "occurredAt");

-- CreateIndex
CREATE INDEX "ProductTransition_organizationId_eventType_occurredAt_idx" ON "ProductTransition"("organizationId", "eventType", "occurredAt");

-- CreateIndex
CREATE INDEX "Issue_organizationId_productId_status_idx" ON "Issue"("organizationId", "productId", "status");

-- CreateIndex
CREATE INDEX "Issue_organizationId_status_idx" ON "Issue"("organizationId", "status");

-- CreateIndex
CREATE INDEX "WeightEvent_organizationId_productId_occurredAt_idx" ON "WeightEvent"("organizationId", "productId", "occurredAt");

-- CreateIndex
CREATE INDEX "WeightEvent_organizationId_employeeId_occurredAt_idx" ON "WeightEvent"("organizationId", "employeeId", "occurredAt");

-- CreateIndex
CREATE INDEX "AuditLog_organizationId_occurredAt_idx" ON "AuditLog"("organizationId", "occurredAt");

-- CreateIndex
CREATE INDEX "AuditLog_actorUserId_occurredAt_idx" ON "AuditLog"("actorUserId", "occurredAt");

-- CreateIndex
CREATE INDEX "AuditLog_targetType_targetId_occurredAt_idx" ON "AuditLog"("targetType", "targetId", "occurredAt");

-- CreateIndex
CREATE INDEX "IdempotencyKey_organizationId_expiresAt_idx" ON "IdempotencyKey"("organizationId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyKey_organizationId_userId_key_key" ON "IdempotencyKey"("organizationId", "userId", "key");

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessRole" ADD CONSTRAINT "AccessRole_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessRolePermission" ADD CONSTRAINT "AccessRolePermission_accessRoleId_fkey" FOREIGN KEY ("accessRoleId") REFERENCES "AccessRole"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessRolePermission" ADD CONSTRAINT "AccessRolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipAccessRole" ADD CONSTRAINT "MembershipAccessRole_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipAccessRole" ADD CONSTRAINT "MembershipAccessRole_organizationId_membershipId_fkey" FOREIGN KEY ("organizationId", "membershipId") REFERENCES "Membership"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipAccessRole" ADD CONSTRAINT "MembershipAccessRole_organizationId_accessRoleId_fkey" FOREIGN KEY ("organizationId", "accessRoleId") REFERENCES "AccessRole"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeProfile" ADD CONSTRAINT "EmployeeProfile_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeProfile" ADD CONSTRAINT "EmployeeProfile_organizationId_membershipId_fkey" FOREIGN KEY ("organizationId", "membershipId") REFERENCES "Membership"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionRole" ADD CONSTRAINT "ProductionRole_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeProductionRole" ADD CONSTRAINT "EmployeeProductionRole_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeProductionRole" ADD CONSTRAINT "EmployeeProductionRole_organizationId_employeeId_fkey" FOREIGN KEY ("organizationId", "employeeId") REFERENCES "EmployeeProfile"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeProductionRole" ADD CONSTRAINT "EmployeeProductionRole_organizationId_productionRoleId_fkey" FOREIGN KEY ("organizationId", "productionRoleId") REFERENCES "ProductionRole"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Location" ADD CONSTRAINT "Location_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Location" ADD CONSTRAINT "Location_organizationId_departmentId_fkey" FOREIGN KEY ("organizationId", "departmentId") REFERENCES "Department"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionOrder" ADD CONSTRAINT "ProductionOrder_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionOrder" ADD CONSTRAINT "ProductionOrder_organizationId_customerId_fkey" FOREIGN KEY ("organizationId", "customerId") REFERENCES "Customer"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductType" ADD CONSTRAINT "ProductType_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_organizationId_productionOrderId_fkey" FOREIGN KEY ("organizationId", "productionOrderId") REFERENCES "ProductionOrder"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_organizationId_productTypeId_fkey" FOREIGN KEY ("organizationId", "productTypeId") REFERENCES "ProductType"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_organizationId_currentWorkerId_fkey" FOREIGN KEY ("organizationId", "currentWorkerId") REFERENCES "EmployeeProfile"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_organizationId_currentRoleId_fkey" FOREIGN KEY ("organizationId", "currentRoleId") REFERENCES "ProductionRole"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_organizationId_currentLocationId_fkey" FOREIGN KEY ("organizationId", "currentLocationId") REFERENCES "Location"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_organizationId_currentStageId_fkey" FOREIGN KEY ("organizationId", "currentStageId") REFERENCES "WorkflowSnapshotStage"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Barcode" ADD CONSTRAINT "Barcode_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Barcode" ADD CONSTRAINT "Barcode_organizationId_productId_fkey" FOREIGN KEY ("organizationId", "productId") REFERENCES "Product"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowTemplate" ADD CONSTRAINT "WorkflowTemplate_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowTemplateStage" ADD CONSTRAINT "WorkflowTemplateStage_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowTemplateStage" ADD CONSTRAINT "WorkflowTemplateStage_organizationId_workflowTemplateId_fkey" FOREIGN KEY ("organizationId", "workflowTemplateId") REFERENCES "WorkflowTemplate"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowTemplateStage" ADD CONSTRAINT "WorkflowTemplateStage_organizationId_productionRoleId_fkey" FOREIGN KEY ("organizationId", "productionRoleId") REFERENCES "ProductionRole"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowSnapshot" ADD CONSTRAINT "WorkflowSnapshot_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowSnapshot" ADD CONSTRAINT "WorkflowSnapshot_organizationId_productId_fkey" FOREIGN KEY ("organizationId", "productId") REFERENCES "Product"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowSnapshot" ADD CONSTRAINT "WorkflowSnapshot_organizationId_sourceTemplateId_fkey" FOREIGN KEY ("organizationId", "sourceTemplateId") REFERENCES "WorkflowTemplate"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowSnapshotStage" ADD CONSTRAINT "WorkflowSnapshotStage_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowSnapshotStage" ADD CONSTRAINT "WorkflowSnapshotStage_organizationId_workflowSnapshotId_fkey" FOREIGN KEY ("organizationId", "workflowSnapshotId") REFERENCES "WorkflowSnapshot"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowSnapshotStage" ADD CONSTRAINT "WorkflowSnapshotStage_organizationId_productionRoleId_fkey" FOREIGN KEY ("organizationId", "productionRoleId") REFERENCES "ProductionRole"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowSnapshotStage" ADD CONSTRAINT "WorkflowSnapshotStage_organizationId_sourceStageId_fkey" FOREIGN KEY ("organizationId", "sourceStageId") REFERENCES "WorkflowTemplateStage"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductAssignment" ADD CONSTRAINT "ProductAssignment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductAssignment" ADD CONSTRAINT "ProductAssignment_organizationId_productId_fkey" FOREIGN KEY ("organizationId", "productId") REFERENCES "Product"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductAssignment" ADD CONSTRAINT "ProductAssignment_organizationId_employeeId_fkey" FOREIGN KEY ("organizationId", "employeeId") REFERENCES "EmployeeProfile"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductAssignment" ADD CONSTRAINT "ProductAssignment_organizationId_productionRoleId_fkey" FOREIGN KEY ("organizationId", "productionRoleId") REFERENCES "ProductionRole"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductAssignment" ADD CONSTRAINT "ProductAssignment_organizationId_locationId_fkey" FOREIGN KEY ("organizationId", "locationId") REFERENCES "Location"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductAssignment" ADD CONSTRAINT "ProductAssignment_organizationId_workflowStageId_fkey" FOREIGN KEY ("organizationId", "workflowStageId") REFERENCES "WorkflowSnapshotStage"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductTransition" ADD CONSTRAINT "ProductTransition_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductTransition" ADD CONSTRAINT "ProductTransition_organizationId_productId_fkey" FOREIGN KEY ("organizationId", "productId") REFERENCES "Product"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductTransition" ADD CONSTRAINT "ProductTransition_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductTransition" ADD CONSTRAINT "ProductTransition_organizationId_fromWorkerId_fkey" FOREIGN KEY ("organizationId", "fromWorkerId") REFERENCES "EmployeeProfile"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductTransition" ADD CONSTRAINT "ProductTransition_organizationId_toWorkerId_fkey" FOREIGN KEY ("organizationId", "toWorkerId") REFERENCES "EmployeeProfile"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductTransition" ADD CONSTRAINT "ProductTransition_organizationId_fromRoleId_fkey" FOREIGN KEY ("organizationId", "fromRoleId") REFERENCES "ProductionRole"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductTransition" ADD CONSTRAINT "ProductTransition_organizationId_toRoleId_fkey" FOREIGN KEY ("organizationId", "toRoleId") REFERENCES "ProductionRole"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductTransition" ADD CONSTRAINT "ProductTransition_organizationId_fromLocationId_fkey" FOREIGN KEY ("organizationId", "fromLocationId") REFERENCES "Location"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductTransition" ADD CONSTRAINT "ProductTransition_organizationId_toLocationId_fkey" FOREIGN KEY ("organizationId", "toLocationId") REFERENCES "Location"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductTransition" ADD CONSTRAINT "ProductTransition_organizationId_fromStageId_fkey" FOREIGN KEY ("organizationId", "fromStageId") REFERENCES "WorkflowSnapshotStage"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductTransition" ADD CONSTRAINT "ProductTransition_organizationId_toStageId_fkey" FOREIGN KEY ("organizationId", "toStageId") REFERENCES "WorkflowSnapshotStage"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_organizationId_productId_fkey" FOREIGN KEY ("organizationId", "productId") REFERENCES "Product"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_reportedByUserId_fkey" FOREIGN KEY ("reportedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_resolvedByUserId_fkey" FOREIGN KEY ("resolvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeightEvent" ADD CONSTRAINT "WeightEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeightEvent" ADD CONSTRAINT "WeightEvent_organizationId_productId_fkey" FOREIGN KEY ("organizationId", "productId") REFERENCES "Product"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeightEvent" ADD CONSTRAINT "WeightEvent_recordedByUserId_fkey" FOREIGN KEY ("recordedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeightEvent" ADD CONSTRAINT "WeightEvent_organizationId_employeeId_fkey" FOREIGN KEY ("organizationId", "employeeId") REFERENCES "EmployeeProfile"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeightEvent" ADD CONSTRAINT "WeightEvent_organizationId_productionRoleId_fkey" FOREIGN KEY ("organizationId", "productionRoleId") REFERENCES "ProductionRole"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdempotencyKey" ADD CONSTRAINT "IdempotencyKey_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdempotencyKey" ADD CONSTRAINT "IdempotencyKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddPartialIndex
CREATE UNIQUE INDEX "product_one_active_assignment"
ON "ProductAssignment" ("productId")
WHERE "endedAt" IS NULL;
