-- Galileo's legacy generated story did not persist a storyJson title, so use
-- its classroom assignment as the stable repair target.
UPDATE "Story" AS story
SET "storyJson" = jsonb_set(
  story."storyJson",
  '{sources}',
  story.report->'sources',
  true
)
WHERE story."storyJson" IS NOT NULL
  AND jsonb_typeof(story."storyJson") = 'object'
  AND jsonb_typeof(story.report->'sources') = 'array'
  AND EXISTS (
    SELECT 1
    FROM "ClassroomAssignment" AS assignment
    WHERE assignment."storyId" = story.id
      AND assignment.title = 'Galileo Maps a New Sky'
  );

UPDATE "Story" AS story
SET report = jsonb_set(
  story.report,
  '{reportText}',
  to_jsonb(
    replace(
      replace(
        replace(
          story.report->>'reportText',
          'https://en.wikipedia.org/wiki/Sidereus_Nuncius',
          '<1>'
        ),
        'https://galileo.library.rice.edu/sci/instruments/telescope.html',
        '<2>'
      ),
      'https://library.si.edu/digital-library/book/sidereusnuncius00gali',
      '<3>'
    )
  ),
  true
)
WHERE jsonb_typeof(story.report) = 'object'
  AND story.report->>'reportText' IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM "ClassroomAssignment" AS assignment
    WHERE assignment."storyId" = story.id
      AND assignment.title = 'Galileo Maps a New Sky'
  );
