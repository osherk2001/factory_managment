ALTER TABLE "WeightEvent"
  ADD COLUMN "locationId" UUID,
  ADD COLUMN "correctsWeightEventId" UUID;

ALTER TABLE "Issue" ADD COLUMN "resolution" TEXT;

CREATE UNIQUE INDEX "WeightEvent_organizationId_productId_id_key"
  ON "WeightEvent" ("organizationId", "productId", "id");

CREATE UNIQUE INDEX "WeightEvent_organizationId_id_key"
  ON "WeightEvent" ("organizationId", "id");

ALTER TABLE "WeightEvent"
  ADD CONSTRAINT "WeightEvent_organizationId_locationId_fkey"
  FOREIGN KEY ("organizationId", "locationId")
  REFERENCES "Location" ("organizationId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "WeightEvent"
  ADD CONSTRAINT "WeightEvent_correction_fkey"
  FOREIGN KEY ("organizationId", "productId", "correctsWeightEventId")
  REFERENCES "WeightEvent" ("organizationId", "productId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "WeightEvent"
  ADD CONSTRAINT "WeightEvent_grams_positive_or_signed_correction"
  CHECK (("type" <> 'CORRECTION' AND "grams" > 0) OR ("type" = 'CORRECTION' AND "grams" <> 0));

CREATE INDEX "WeightEvent_organizationId_locationId_occurredAt_idx"
  ON "WeightEvent" ("organizationId", "locationId", "occurredAt");

CREATE INDEX "WeightEvent_organizationId_correctsWeightEventId_idx"
  ON "WeightEvent" ("organizationId", "correctsWeightEventId");

CREATE TABLE "RateLimitBucket" (
  "scope" VARCHAR(50) NOT NULL,
  "keyHash" CHAR(64) NOT NULL,
  "windowStartedAt" TIMESTAMPTZ(6) NOT NULL,
  "count" INTEGER NOT NULL DEFAULT 0,
  "expiresAt" TIMESTAMPTZ(6) NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "organizationId" UUID,
  CONSTRAINT "RateLimitBucket_pkey" PRIMARY KEY ("scope", "keyHash", "windowStartedAt")
);

CREATE INDEX "RateLimitBucket_expiresAt_idx"
  ON "RateLimitBucket" ("expiresAt");

CREATE INDEX "RateLimitBucket_organizationId_scope_windowStartedAt_idx"
  ON "RateLimitBucket" ("organizationId", "scope", "windowStartedAt");

ALTER TABLE "RateLimitBucket"
  ADD CONSTRAINT "RateLimitBucket_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
