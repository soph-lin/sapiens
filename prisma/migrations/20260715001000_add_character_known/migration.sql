ALTER TABLE "Character" ADD COLUMN "known" BOOLEAN;

UPDATE "Character" SET "known" = TRUE;

ALTER TABLE "Character" ALTER COLUMN "known" SET NOT NULL;
