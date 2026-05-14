-- Deduplicate tokenHash before unique constraint (keep one row per hash).
DELETE FROM "Session" AS a
    USING "Session" AS b
WHERE a."tokenHash" = b."tokenHash"
  AND a.id > b.id;

-- DropIndex
DROP INDEX IF EXISTS "Session_tokenHash_idx";

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");
