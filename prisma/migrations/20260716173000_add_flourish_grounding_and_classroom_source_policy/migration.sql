CREATE TYPE "ClassroomSourceMode" AS ENUM ('free', 'restricted');
CREATE TYPE "FieldNoteAuthorType" AS ENUM ('user', 'bot');

ALTER TABLE "Classroom"
  ADD COLUMN "sourceMode" "ClassroomSourceMode" NOT NULL DEFAULT 'free',
  ADD COLUMN "approvedDomains" JSONB;

ALTER TABLE "Story"
  ADD COLUMN "createdById" TEXT,
  ADD COLUMN "report" JSONB;

ALTER TABLE "FieldNote"
  ALTER COLUMN "assignmentId" DROP NOT NULL,
  ADD COLUMN "authorType" "FieldNoteAuthorType" NOT NULL DEFAULT 'user',
  ADD COLUMN "authorName" TEXT,
  ADD COLUMN "sources" JSONB;

ALTER TABLE "Story" ADD CONSTRAINT "Story_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Story_createdById_idx" ON "Story"("createdById");
