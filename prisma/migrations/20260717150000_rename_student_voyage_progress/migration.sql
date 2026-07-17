ALTER TABLE "StudentVoyageProgress" RENAME TO "VoyageProgress";
ALTER TABLE "VoyageProgress" ALTER COLUMN "assignmentId" DROP NOT NULL;

ALTER TABLE "VoyageProgress" RENAME CONSTRAINT "StudentVoyageProgress_pkey" TO "VoyageProgress_pkey";
ALTER TABLE "VoyageProgress" RENAME CONSTRAINT "StudentVoyageProgress_studentId_fkey" TO "VoyageProgress_studentId_fkey";
ALTER TABLE "VoyageProgress" RENAME CONSTRAINT "StudentVoyageProgress_storyId_fkey" TO "VoyageProgress_storyId_fkey";
ALTER TABLE "VoyageProgress" DROP CONSTRAINT "StudentVoyageProgress_assignmentId_fkey";
ALTER TABLE "VoyageProgress"
  ADD CONSTRAINT "VoyageProgress_assignmentId_fkey"
  FOREIGN KEY ("assignmentId") REFERENCES "ClassroomAssignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER INDEX "StudentVoyageProgress_studentId_storyId_key" RENAME TO "VoyageProgress_studentId_storyId_key";
ALTER INDEX "StudentVoyageProgress_assignmentId_idx" RENAME TO "VoyageProgress_assignmentId_idx";
ALTER INDEX "StudentVoyageProgress_storyId_idx" RENAME TO "VoyageProgress_storyId_idx";
