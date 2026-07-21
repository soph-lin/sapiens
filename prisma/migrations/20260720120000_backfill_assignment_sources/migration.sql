-- Backfill the classroom assignment and voyage source lists from each voyage report.
WITH report_sources AS (
  SELECT
    s.id AS story_id,
    jsonb_agg(source->>'url' ORDER BY source_position) FILTER (
      WHERE jsonb_typeof(source) = 'object'
        AND source ? 'url'
        AND jsonb_typeof(source->'url') = 'string'
    ) AS urls
  FROM "Story" s
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(s.report->'sources') = 'array' THEN s.report->'sources'
      ELSE '[]'::jsonb
    END
  ) WITH ORDINALITY AS source_data(source, source_position)
  GROUP BY s.id
)
UPDATE "ClassroomAssignment" AS assignment
SET "sources" = report_sources.urls
FROM report_sources
WHERE assignment."storyId" = report_sources.story_id
  AND assignment.title IN (
    'Darwin’s Voyage of Discovery',
    'Into the Normandy Landings',
    'Harriet Tubman and the Underground Railroad',
    'Galileo Maps a New Sky'
  )
  AND (
    assignment."sources" IS NULL
    OR assignment."sources" = '[]'::jsonb
  )
  AND jsonb_array_length(report_sources.urls) > 0;

WITH report_sources AS (
  SELECT
    s.id AS story_id,
    jsonb_agg(source->>'url' ORDER BY source_position) FILTER (
      WHERE jsonb_typeof(source) = 'object'
        AND source ? 'url'
        AND jsonb_typeof(source->'url') = 'string'
    ) AS urls
  FROM "Story" s
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(s.report->'sources') = 'array' THEN s.report->'sources'
      ELSE '[]'::jsonb
    END
  ) WITH ORDINALITY AS source_data(source, source_position)
  GROUP BY s.id
)
UPDATE "Story" AS story
SET "storyJson" = jsonb_set(story."storyJson", '{sources}', report_sources.urls, true)
FROM report_sources
WHERE story.id = report_sources.story_id
  AND story."storyJson" IS NOT NULL
  AND jsonb_typeof(story."storyJson") = 'object'
  AND story."storyJson"->>'title' IN (
    'Darwin’s Voyage of Discovery',
    'Into the Normandy Landings',
    'Harriet Tubman and the Underground Railroad',
    'Galileo Maps a New Sky'
  )
  AND jsonb_array_length(report_sources.urls) > 0;

-- Galileo's report used raw URLs instead of the numbered footnote markers
-- consumed by ReportMarkdown. Preserve its existing citations while making them
-- render as footnotes against the stored report source list.
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
WHERE story."storyJson"->>'title' = 'Galileo Maps a New Sky'
  AND jsonb_typeof(story.report) = 'object'
  AND story.report->>'reportText' IS NOT NULL
  AND story.report->>'reportText' NOT LIKE '%<1>%';
