-- A logical workflow is identified by Organization and name. Historical
-- versions remain stored, but PostgreSQL permits at most one active version.
CREATE UNIQUE INDEX "workflow_template_one_active_version"
ON "WorkflowTemplate" ("organizationId", "name")
WHERE "isActive" = true;
