-- AlterTable
ALTER TABLE "Session" ADD COLUMN "client" TEXT NOT NULL DEFAULT 'web';

-- AlterTable
ALTER TABLE "Session" ADD COLUMN "absoluteExpiresAt" TIMESTAMP(3);

UPDATE "Session" SET "absoluteExpiresAt" = "createdAt" + INTERVAL '180 days';

ALTER TABLE "Session" ALTER COLUMN "absoluteExpiresAt" SET NOT NULL;
