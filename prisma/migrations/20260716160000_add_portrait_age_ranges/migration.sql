CREATE TYPE "AgeRange" AS ENUM ('BABY', 'CHILD', 'TEENAGER', 'YOUNG_ADULT', 'ADULT', 'ELDERLY');

ALTER TABLE "Character"
ADD COLUMN "ageRange" "AgeRange" NOT NULL DEFAULT 'ADULT';

ALTER TABLE "Asset"
ADD COLUMN "ageRange" "AgeRange";

-- Existing portraits are adult by default. These descriptions explicitly identify
-- younger story versions and were reviewed against the current character catalog:
-- Anne Frank is thirteen; Apprentice Liu, Dawid Ostrowski, and Steve Bales are young adults.
UPDATE "Character"
SET "ageRange" = CASE
  WHEN "name" = 'Anne Frank'
    OR "description" ILIKE '%thirteen years old%'
    THEN 'TEENAGER'::"AgeRange"
  WHEN "name" IN ('Apprentice Liu', 'Dawid Ostrowski', 'Steve Bales')
    OR "description" ILIKE '%young man%'
    OR "description" ILIKE '%young helper%'
    OR "description" ILIKE '%twenty-six years old%'
    THEN 'YOUNG_ADULT'::"AgeRange"
  ELSE 'ADULT'::"AgeRange"
END;

-- Character portraits may be shared across stories. The reviewed catalog has no
-- shared portrait with conflicting classifications, so copy the Character variant
-- onto its linked reusable portrait asset.
UPDATE "Asset" AS asset
SET "ageRange" = character."ageRange"
FROM "Character" AS character
WHERE asset.id = character."assetId"
  AND asset.type = 'CHARACTER';
