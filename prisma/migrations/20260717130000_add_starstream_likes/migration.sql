CREATE TABLE "StarstreamLike" (
    "id" TEXT NOT NULL,
    "logId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StarstreamLike_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StarstreamLike_logId_userId_key" ON "StarstreamLike"("logId", "userId");
CREATE INDEX "StarstreamLike_userId_idx" ON "StarstreamLike"("userId");

ALTER TABLE "StarstreamLike" ADD CONSTRAINT "StarstreamLike_logId_fkey"
  FOREIGN KEY ("logId") REFERENCES "StarstreamLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StarstreamLike" ADD CONSTRAINT "StarstreamLike_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
