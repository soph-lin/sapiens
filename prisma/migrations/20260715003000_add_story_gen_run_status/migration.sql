CREATE TYPE "StoryGenRunStatus" AS ENUM ('ongoing', 'fail', 'succeed');

ALTER TABLE "StoryGenRun" ADD COLUMN "status" "StoryGenRunStatus";

UPDATE "StoryGenRun"
SET "status" = CASE
  WHEN "error" IS NOT NULL THEN 'fail'::"StoryGenRunStatus"
  WHEN "storyId" IS NOT NULL AND "finishedAt" IS NOT NULL THEN 'succeed'::"StoryGenRunStatus"
  ELSE 'ongoing'::"StoryGenRunStatus"
END;

ALTER TABLE "StoryGenRun"
  ALTER COLUMN "status" SET DEFAULT 'ongoing',
  ALTER COLUMN "status" SET NOT NULL;
