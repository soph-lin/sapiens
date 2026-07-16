import dotenv from "dotenv";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Client } from "pg";

dotenv.config({ path: ".env.local" });
dotenv.config();

const FRAME_KEYS = [
  "south",
  "south-east",
  "east",
  "north-east",
  "north",
  "north-west",
  "west",
  "south-west",
];
const framesDirectory = process.env.BI_SHENG_FRAMES_DIR ?? path.join(
  os.homedir(),
  "Downloads/Bi_Sheng/Bi_Sheng/rotations",
);

const client = new Client({ connectionString: process.env.DATABASE_URL });

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");

  const frames = await Promise.all(FRAME_KEYS.map(async (frameKey) => ({
    frameKey,
    data: await readFile(path.join(framesDirectory, `${frameKey}.png`)),
  })));
  const defaultFrame = frames[0];
  const metadata = {
    provider: "manual-upload",
    source: "Bi Sheng PixelLab export",
    directions: frames.length,
    frameOrder: FRAME_KEYS,
  };

  await client.connect();
  await client.query("BEGIN");
  try {
    const characterResult = await client.query(
      'SELECT "id", "spriteAssetId" FROM "Character" WHERE lower("name") = lower($1) ORDER BY "id" LIMIT 1',
      ["Bi Sheng"],
    );
    const character = characterResult.rows[0];
    if (!character) throw new Error('Character "Bi Sheng" was not found');

    const assetId = character.spriteAssetId ?? randomUUID().replaceAll("-", "");
    if (character.spriteAssetId) {
      await client.query(
        'UPDATE "Asset" SET "name" = $1, "type" = $2, "mimeType" = $3, "data" = $4, "metadata" = $5 WHERE "id" = $6',
        ["Bi Sheng", "CHARACTER_SPRITE", "image/png", defaultFrame.data, metadata, assetId],
      );
    } else {
      await client.query(
        'INSERT INTO "Asset" ("id", "type", "name", "mimeType", "data", "metadata") VALUES ($1, $2, $3, $4, $5, $6)',
        [assetId, "CHARACTER_SPRITE", "Bi Sheng", "image/png", defaultFrame.data, metadata],
      );
      await client.query('UPDATE "Character" SET "spriteAssetId" = $1 WHERE "id" = $2', [assetId, character.id]);
    }

    await client.query('DELETE FROM "AssetFrame" WHERE "assetId" = $1', [assetId]);
    for (const frame of frames) {
      await client.query(
        'INSERT INTO "AssetFrame" ("id", "assetId", "frameKey", "mimeType", "data", "metadata") VALUES ($1, $2, $3, $4, $5, $6)',
        [randomUUID().replaceAll("-", ""), assetId, frame.frameKey, "image/png", frame.data, metadata],
      );
    }

    await client.query("COMMIT");
    console.log(`Imported ${frames.length} Bi Sheng frames into Asset ${assetId}.`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}).finally(() => client.end());
