ALTER TABLE "Story" ADD COLUMN "synopsis" JSONB;

-- Newer runs already contain the cleaned topic and Director synopsis in their
-- replay snapshots. Use those snapshots to backfill existing stories.
UPDATE "Story" AS story
SET
  "topic" = COALESCE(NULLIF(run."researcherOutput"->>'topic', ''), story."topic"),
  "synopsis" = run."directorOutput"->'synopsis'
FROM "StoryGenRun" AS run
WHERE run."storyId" = story."id"
  AND run."directorOutput" IS NOT NULL
  AND jsonb_typeof(run."directorOutput"->'synopsis') = 'object';

-- Older runs predate the researcher topic field. Their article URL is the
-- canonical source we have for a cleaned topic, so use its Wikipedia title.
UPDATE "Story" AS story
SET "topic" = regexp_replace(
  replace(
    replace(
      split_part(split_part(run."researcherOutput"->>'articleUrl', '/wiki/', 2), '?', 1),
      '_',
      ' '
    ),
    '%27',
    ''''
  ),
  '\s+\([^)]*\)$',
  ''
)
FROM "StoryGenRun" AS run
WHERE run."storyId" = story."id"
  AND (run."researcherOutput"->>'topic' IS NULL OR trim(run."researcherOutput"->>'topic') = '')
  AND run."researcherOutput"->>'articleUrl' LIKE '%/wiki/%';
