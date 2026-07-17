ALTER TABLE "StoryGenRun" ADD COLUMN "topic" TEXT;
ALTER TABLE "StoryGenRun" ADD COLUMN "curatorOutput" JSONB;

UPDATE "StoryGenRun"
SET "topic" = COALESCE(
  NULLIF("researcherOutput"->>'topic', ''),
  (SELECT "topic" FROM "Story" WHERE "Story"."id" = "StoryGenRun"."storyId")
);

ALTER TABLE "StoryGenRun"
  ALTER COLUMN "steering" TYPE TEXT
  USING CASE
    WHEN "steering" IS NULL THEN NULL
    WHEN jsonb_typeof("steering") = 'string' THEN "steering" #>> '{}'
    WHEN jsonb_typeof("steering") = 'null' THEN NULL
    WHEN jsonb_typeof("steering") = 'object' THEN COALESCE(
      NULLIF("steering"->'curator'->>'request', ''),
      NULLIF("steering"->>'historicalEvent', ''),
      NULLIF("steering"->>'topic', ''),
      "steering"::text
    )
    ELSE "steering"::text
  END;
