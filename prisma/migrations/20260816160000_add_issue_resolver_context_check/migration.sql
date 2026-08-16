ALTER TABLE "Issue"
ADD CONSTRAINT "Issue_resolver_context_check"
CHECK (
  (
    "resolvedByUserId" IS NULL
    AND "resolvedByMembershipId" IS NULL
  )
  OR
  (
    "resolvedByUserId" IS NOT NULL
    AND "resolvedByMembershipId" IS NOT NULL
  )
);
