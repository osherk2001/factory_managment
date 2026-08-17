-- A handling location belongs to the employee's role assignment, not to the
-- reusable organization-wide ProductionRole.
ALTER TABLE "EmployeeProductionRole"
ADD COLUMN "handlingLocationId" UUID;

CREATE INDEX "EmployeeProductionRole_organizationId_handlingLocationId_idx"
ON "EmployeeProductionRole"("organizationId", "handlingLocationId");

ALTER TABLE "EmployeeProductionRole"
ADD CONSTRAINT "EmployeeProductionRole_organizationId_handlingLocationId_fkey"
FOREIGN KEY ("organizationId", "handlingLocationId")
REFERENCES "Location"("organizationId", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;
