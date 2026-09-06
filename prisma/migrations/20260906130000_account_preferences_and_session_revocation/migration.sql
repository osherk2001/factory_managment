ALTER TABLE "User"
  ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "preferredLocale" VARCHAR(2) NOT NULL DEFAULT 'he',
  ADD COLUMN "selectedOrganizationId" UUID;
ALTER TABLE "User" ADD CONSTRAINT "User_preferredLocale_check" CHECK ("preferredLocale" IN ('he', 'en', 'ru'));
-- selectedOrganizationId is a preference, never authorization. Every tenant
-- resolution validates it against the user's current active memberships.
