-- AlterTable
ALTER TABLE "Classroom" ADD COLUMN "code" TEXT;

-- Backfill existing classrooms with stable join codes
UPDATE "Classroom" SET "code" = 'DARWIN' WHERE "id" = 'demo-classroom';
UPDATE "Classroom"
SET "code" = UPPER(SUBSTRING(REPLACE("id", '-', '') FROM 1 FOR 6))
WHERE "code" IS NULL;

ALTER TABLE "Classroom" ALTER COLUMN "code" SET NOT NULL;

CREATE UNIQUE INDEX "Classroom_code_key" ON "Classroom"("code");
