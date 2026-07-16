CREATE TABLE "AssetFrame" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "frameKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL DEFAULT 'image/png',
    "data" BYTEA NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssetFrame_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AssetFrame_assetId_frameKey_key" ON "AssetFrame"("assetId", "frameKey");
CREATE INDEX "AssetFrame_assetId_idx" ON "AssetFrame"("assetId");

ALTER TABLE "AssetFrame"
ADD CONSTRAINT "AssetFrame_assetId_fkey"
FOREIGN KEY ("assetId") REFERENCES "Asset"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
