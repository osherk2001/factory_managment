-- Drop the stage foreign keys before adding Product ownership to stage references.
ALTER TABLE "Product" DROP CONSTRAINT "Product_organizationId_currentStageId_fkey";
ALTER TABLE "ProductAssignment" DROP CONSTRAINT "ProductAssignment_organizationId_workflowStageId_fkey";
ALTER TABLE "ProductTransition" DROP CONSTRAINT "ProductTransition_organizationId_fromStageId_fkey";
ALTER TABLE "ProductTransition" DROP CONSTRAINT "ProductTransition_organizationId_toStageId_fkey";
ALTER TABLE "WorkflowSnapshotStage" DROP CONSTRAINT "WorkflowSnapshotStage_organizationId_workflowSnapshotId_fkey";

ALTER TABLE "AuditLog" ADD COLUMN "actorMembershipId" UUID;
ALTER TABLE "IdempotencyKey" ADD COLUMN "actorMembershipId" UUID;
ALTER TABLE "Issue" ADD COLUMN "reportedByMembershipId" UUID;
ALTER TABLE "Issue" ADD COLUMN "resolvedByMembershipId" UUID;
ALTER TABLE "ProductTransition" ADD COLUMN "actorMembershipId" UUID;
ALTER TABLE "User" ADD COLUMN "isSystemAdmin" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "WeightEvent" ADD COLUMN "recordedByMembershipId" UUID;
ALTER TABLE "WorkflowSnapshotStage" ADD COLUMN "productId" UUID;

-- These checks make migration failures explicit instead of silently losing actor context.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "User"
    WHERE "email" IS NOT NULL
    GROUP BY "email"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot add User.email uniqueness: duplicate non-null email values exist';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "User"
    WHERE "username" IS NOT NULL
    GROUP BY "username"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot add User.username uniqueness: duplicate non-null username values exist';
  END IF;
END;
$$;

-- WorkflowSnapshotStage.productId is derived from its owning snapshot and is
-- materialized so all Product-to-stage references can use a composite FK.
UPDATE "WorkflowSnapshotStage" AS stage
SET "productId" = snapshot."productId"
FROM "WorkflowSnapshot" AS snapshot
WHERE snapshot."organizationId" = stage."organizationId"
  AND snapshot."id" = stage."workflowSnapshotId";

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "WorkflowSnapshotStage" WHERE "productId" IS NULL) THEN
    RAISE EXCEPTION 'Cannot establish workflow stage ownership: a snapshot stage has no owning Product';
  END IF;
END;
$$;

-- Backfill tenant membership context for existing tenant actors.
UPDATE "ProductTransition" AS transition
SET "actorMembershipId" = membership."id"
FROM "Membership" AS membership
WHERE membership."organizationId" = transition."organizationId"
  AND membership."userId" = transition."actorUserId";

UPDATE "Issue" AS issue
SET "reportedByMembershipId" = membership."id"
FROM "Membership" AS membership
WHERE membership."organizationId" = issue."organizationId"
  AND membership."userId" = issue."reportedByUserId";

UPDATE "Issue" AS issue
SET "resolvedByMembershipId" = membership."id"
FROM "Membership" AS membership
WHERE membership."organizationId" = issue."organizationId"
  AND membership."userId" = issue."resolvedByUserId";

UPDATE "WeightEvent" AS event
SET "recordedByMembershipId" = membership."id"
FROM "Membership" AS membership
WHERE membership."organizationId" = event."organizationId"
  AND membership."userId" = event."recordedByUserId";

UPDATE "AuditLog" AS audit
SET "actorMembershipId" = membership."id"
FROM "Membership" AS membership
WHERE audit."organizationId" IS NOT NULL
  AND audit."actorUserId" IS NOT NULL
  AND membership."organizationId" = audit."organizationId"
  AND membership."userId" = audit."actorUserId";

UPDATE "IdempotencyKey" AS request
SET "actorMembershipId" = membership."id"
FROM "Membership" AS membership
WHERE membership."organizationId" = request."organizationId"
  AND membership."userId" = request."userId";

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "ProductTransition" WHERE "actorMembershipId" IS NULL) THEN
    RAISE EXCEPTION 'Cannot establish ProductTransition actor membership context';
  END IF;

  IF EXISTS (SELECT 1 FROM "Issue" WHERE "reportedByMembershipId" IS NULL) THEN
    RAISE EXCEPTION 'Cannot establish Issue reporter membership context';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "Issue"
    WHERE "resolvedByUserId" IS NOT NULL
      AND "resolvedByMembershipId" IS NULL
  ) THEN
    RAISE EXCEPTION 'Cannot establish Issue resolver membership context';
  END IF;

  IF EXISTS (SELECT 1 FROM "WeightEvent" WHERE "recordedByMembershipId" IS NULL) THEN
    RAISE EXCEPTION 'Cannot establish WeightEvent recorder membership context';
  END IF;

  IF EXISTS (SELECT 1 FROM "IdempotencyKey" WHERE "actorMembershipId" IS NULL) THEN
    RAISE EXCEPTION 'Cannot establish IdempotencyKey actor membership context';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "AuditLog"
    WHERE "organizationId" IS NOT NULL
      AND ("actorUserId" IS NULL OR "actorMembershipId" IS NULL)
  ) THEN
    RAISE EXCEPTION 'Tenant AuditLog rows require both actorUserId and actorMembershipId';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "AuditLog"
    WHERE "organizationId" IS NULL
      AND "actorMembershipId" IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Platform AuditLog rows cannot reference a tenant membership';
  END IF;
END;
$$;

ALTER TABLE "IdempotencyKey" ALTER COLUMN "actorMembershipId" SET NOT NULL;
ALTER TABLE "Issue" ALTER COLUMN "reportedByMembershipId" SET NOT NULL;
ALTER TABLE "ProductTransition" ALTER COLUMN "actorMembershipId" SET NOT NULL;
ALTER TABLE "WeightEvent" ALTER COLUMN "recordedByMembershipId" SET NOT NULL;
ALTER TABLE "WorkflowSnapshotStage" ALTER COLUMN "productId" SET NOT NULL;

CREATE UNIQUE INDEX "Membership_organizationId_id_userId_key"
ON "Membership"("organizationId", "id", "userId");

CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

CREATE UNIQUE INDEX "WorkflowSnapshot_organizationId_id_productId_key"
ON "WorkflowSnapshot"("organizationId", "id", "productId");

CREATE UNIQUE INDEX "WorkflowSnapshotStage_organizationId_productId_id_key"
ON "WorkflowSnapshotStage"("organizationId", "productId", "id");

ALTER TABLE "Product" ADD CONSTRAINT "Product_organizationId_id_currentStageId_fkey"
FOREIGN KEY ("organizationId", "id", "currentStageId")
REFERENCES "WorkflowSnapshotStage"("organizationId", "productId", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "WorkflowSnapshotStage" ADD CONSTRAINT "WorkflowSnapshotStage_organizationId_workflowSnapshotId_pr_fkey"
FOREIGN KEY ("organizationId", "workflowSnapshotId", "productId")
REFERENCES "WorkflowSnapshot"("organizationId", "id", "productId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProductAssignment" ADD CONSTRAINT "ProductAssignment_organizationId_productId_workflowStageId_fkey"
FOREIGN KEY ("organizationId", "productId", "workflowStageId")
REFERENCES "WorkflowSnapshotStage"("organizationId", "productId", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProductTransition" ADD CONSTRAINT "ProductTransition_organizationId_actorMembershipId_actorUs_fkey"
FOREIGN KEY ("organizationId", "actorMembershipId", "actorUserId")
REFERENCES "Membership"("organizationId", "id", "userId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProductTransition" ADD CONSTRAINT "ProductTransition_organizationId_productId_fromStageId_fkey"
FOREIGN KEY ("organizationId", "productId", "fromStageId")
REFERENCES "WorkflowSnapshotStage"("organizationId", "productId", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProductTransition" ADD CONSTRAINT "ProductTransition_organizationId_productId_toStageId_fkey"
FOREIGN KEY ("organizationId", "productId", "toStageId")
REFERENCES "WorkflowSnapshotStage"("organizationId", "productId", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Issue" ADD CONSTRAINT "Issue_organizationId_reportedByMembershipId_reportedByUser_fkey"
FOREIGN KEY ("organizationId", "reportedByMembershipId", "reportedByUserId")
REFERENCES "Membership"("organizationId", "id", "userId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Issue" ADD CONSTRAINT "Issue_organizationId_resolvedByMembershipId_resolvedByUser_fkey"
FOREIGN KEY ("organizationId", "resolvedByMembershipId", "resolvedByUserId")
REFERENCES "Membership"("organizationId", "id", "userId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "WeightEvent" ADD CONSTRAINT "WeightEvent_organizationId_recordedByMembershipId_recorded_fkey"
FOREIGN KEY ("organizationId", "recordedByMembershipId", "recordedByUserId")
REFERENCES "Membership"("organizationId", "id", "userId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_organizationId_actorMembershipId_actorUserId_fkey"
FOREIGN KEY ("organizationId", "actorMembershipId", "actorUserId")
REFERENCES "Membership"("organizationId", "id", "userId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_tenant_actor_context_check"
CHECK (
  ("organizationId" IS NULL AND "actorMembershipId" IS NULL)
  OR
  ("organizationId" IS NOT NULL AND "actorUserId" IS NOT NULL AND "actorMembershipId" IS NOT NULL)
);

ALTER TABLE "IdempotencyKey" ADD CONSTRAINT "IdempotencyKey_organizationId_actorMembershipId_userId_fkey"
FOREIGN KEY ("organizationId", "actorMembershipId", "userId")
REFERENCES "Membership"("organizationId", "id", "userId")
ON DELETE RESTRICT ON UPDATE CASCADE;
