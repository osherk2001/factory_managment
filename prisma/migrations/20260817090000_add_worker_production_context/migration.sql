-- Persist the worker's current production working context without making
-- ProductionRole an authorization concept.
CREATE TABLE "WorkerProductionContext" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "activeProductionRoleId" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "WorkerProductionContext_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkerProductionContext_organizationId_employeeId_key"
ON "WorkerProductionContext"("organizationId", "employeeId");

CREATE INDEX "WorkerProductionContext_organizationId_activeProductionRoleId_idx"
ON "WorkerProductionContext"("organizationId", "activeProductionRoleId");

ALTER TABLE "WorkerProductionContext"
ADD CONSTRAINT "WorkerProductionContext_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "WorkerProductionContext"
ADD CONSTRAINT "WorkerProductionContext_organizationId_employeeId_fkey"
FOREIGN KEY ("organizationId", "employeeId")
REFERENCES "EmployeeProfile"("organizationId", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "WorkerProductionContext"
ADD CONSTRAINT "WorkerProductionContext_organizationId_activeProductionRoleId_fkey"
FOREIGN KEY ("organizationId", "activeProductionRoleId")
REFERENCES "ProductionRole"("organizationId", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;
