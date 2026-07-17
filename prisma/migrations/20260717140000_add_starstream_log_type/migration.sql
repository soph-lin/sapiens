CREATE TYPE "StarstreamLogType" AS ENUM ('post', 'visitorNote');

ALTER TABLE "StarstreamLog"
  ADD COLUMN "type" "StarstreamLogType" NOT NULL DEFAULT 'post';

CREATE INDEX "StarstreamLog_type_idx" ON "StarstreamLog"("type");
