ALTER TABLE "StoryGenRun" ADD COLUMN "slug" TEXT;
ALTER TABLE "StoryGenRun" ADD COLUMN "steering" JSONB;
ALTER TABLE "StoryGenRun" ADD COLUMN "modelConfig" JSONB;
ALTER TABLE "StoryGenRun" ADD COLUMN "storyConfig" JSONB;
ALTER TABLE "StoryGenRun" ADD COLUMN "researcherOutput" JSONB;
ALTER TABLE "StoryGenRun" ADD COLUMN "directorOutput" JSONB;
ALTER TABLE "StoryGenRun" ADD COLUMN "writerOutput" JSONB;
ALTER TABLE "StoryGenRun" ADD COLUMN "artistOutput" JSONB;

CREATE UNIQUE INDEX "StoryGenRun_slug_key" ON "StoryGenRun"("slug");
