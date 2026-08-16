-- Completed operations may need to replay their original response after the
-- referenced business record has moved to a later lifecycle state.
ALTER TABLE "IdempotencyKey"
ADD COLUMN "resultData" JSONB;
