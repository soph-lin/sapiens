-- Restore the complete Director synopsis when an older Story row only kept
-- the premise but its replay snapshot still has the full object.
UPDATE "Story" AS story
SET "synopsis" = run."directorOutput"->'synopsis'
FROM "StoryGenRun" AS run
WHERE run."storyId" = story."id"
  AND jsonb_typeof(run."directorOutput"->'synopsis') = 'object'
  AND jsonb_typeof(story."synopsis") = 'object'
  AND story."synopsis" ? 'premise'
  AND NOT (
    story."synopsis" ? 'eventSpine'
    AND story."synopsis" ? 'playerGoal'
    AND story."synopsis" ? 'learningFocus'
  )
  AND run."directorOutput"->'synopsis' ? 'premise'
  AND run."directorOutput"->'synopsis' ? 'eventSpine'
  AND run."directorOutput"->'synopsis' ? 'playerGoal'
  AND run."directorOutput"->'synopsis' ? 'learningFocus';
