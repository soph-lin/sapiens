-- Public Starstream forum posts (replies + URL/video attachments).
CREATE TABLE "StarstreamLog" (
    "id" TEXT NOT NULL,
    "parentId" TEXT,
    "allowReplies" BOOLEAN NOT NULL DEFAULT true,
    "assignmentId" TEXT,
    "storyId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "authorType" "FieldNoteAuthorType" NOT NULL DEFAULT 'user',
    "authorName" TEXT,
    "fieldNoteId" TEXT,
    "title" TEXT,
    "content" JSONB NOT NULL,
    "attachments" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StarstreamLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StarstreamLog_fieldNoteId_key" ON "StarstreamLog"("fieldNoteId");
CREATE INDEX "StarstreamLog_assignmentId_storyId_createdAt_idx" ON "StarstreamLog"("assignmentId", "storyId", "createdAt");
CREATE INDEX "StarstreamLog_parentId_createdAt_idx" ON "StarstreamLog"("parentId", "createdAt");
CREATE INDEX "StarstreamLog_authorId_idx" ON "StarstreamLog"("authorId");
CREATE INDEX "StarstreamLog_storyId_createdAt_idx" ON "StarstreamLog"("storyId", "createdAt");

ALTER TABLE "StarstreamLog" ADD CONSTRAINT "StarstreamLog_parentId_fkey"
  FOREIGN KEY ("parentId") REFERENCES "StarstreamLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StarstreamLog" ADD CONSTRAINT "StarstreamLog_assignmentId_fkey"
  FOREIGN KEY ("assignmentId") REFERENCES "ClassroomAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StarstreamLog" ADD CONSTRAINT "StarstreamLog_storyId_fkey"
  FOREIGN KEY ("storyId") REFERENCES "Story"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StarstreamLog" ADD CONSTRAINT "StarstreamLog_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StarstreamLog" ADD CONSTRAINT "StarstreamLog_fieldNoteId_fkey"
  FOREIGN KEY ("fieldNoteId") REFERENCES "FieldNote"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill root posts from existing published field notes.
INSERT INTO "StarstreamLog" (
  "id",
  "parentId",
  "allowReplies",
  "assignmentId",
  "storyId",
  "authorId",
  "authorType",
  "authorName",
  "fieldNoteId",
  "title",
  "content",
  "attachments",
  "createdAt",
  "updatedAt"
)
SELECT
  'ssl_' || "id",
  NULL,
  true,
  "assignmentId",
  "storyId",
  "authorId",
  "authorType",
  "authorName",
  "id",
  "title",
  "content",
  CASE
    WHEN "sources" IS NULL THEN NULL
    WHEN jsonb_typeof("sources") = 'array' THEN (
      SELECT jsonb_agg(
        jsonb_build_object(
          'url', elem,
          'kind', CASE
            WHEN elem ~* '(youtube\.com|youtu\.be|vimeo\.com|/\S+\.(mp4|webm|mov)(\?|$))' THEN 'video'
            ELSE 'link'
          END
        )
      )
      FROM jsonb_array_elements_text("sources") AS elem
    )
    ELSE NULL
  END,
  COALESCE("publishedAt", "createdAt"),
  "updatedAt"
FROM "FieldNote"
WHERE "status" = 'published';
