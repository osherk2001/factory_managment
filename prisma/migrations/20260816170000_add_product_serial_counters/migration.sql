-- Product serial allocation is scoped to an Organization and UTC Gregorian year.
CREATE TABLE "ProductSerialCounter" (
    "organizationId" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "lastValue" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ProductSerialCounter_pkey" PRIMARY KEY ("organizationId", "year")
);

CREATE INDEX "ProductSerialCounter_organizationId_idx"
ON "ProductSerialCounter"("organizationId");

ALTER TABLE "ProductSerialCounter"
ADD CONSTRAINT "ProductSerialCounter_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- Preserve continuity for any existing serials that already use the approved
-- PRD-YYYY-###### format. Other legacy serial formats remain valid and do not
-- collide with newly generated serials.
INSERT INTO "ProductSerialCounter" ("organizationId", "year", "lastValue")
SELECT
    "organizationId",
    split_part("serialNumber", '-', 2)::INTEGER,
    MAX(split_part("serialNumber", '-', 3)::INTEGER)
FROM "Product"
WHERE "serialNumber" ~ '^PRD-[0-9]{4}-[0-9]{6}$'
GROUP BY "organizationId", split_part("serialNumber", '-', 2);
