import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const EXCLUDED_FOLDERS = new Set(["floorsandwalls", "spritesheets"]);
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"]);

export function GET() {
  const assetsDirectory = path.join(process.cwd(), "public", "assets");
  const folders = readdirSync(assetsDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith(".") && !EXCLUDED_FOLDERS.has(entry.name))
    .map((entry) => entry.name)
    .sort();
  const assets = folders.flatMap((folder) => {
    const directory = path.join(assetsDirectory, folder);
    return readdirSync(directory)
      .filter((file) => IMAGE_EXTENSIONS.has(path.extname(file).toLowerCase()))
      .filter((file) => {
        try { return statSync(path.join(directory, file)).isFile(); } catch { return false; }
      })
      .sort()
      .map((file) => ({
        folder,
        file,
        assetPath: `/assets/${folder}/${encodeURIComponent(file)}`,
        name: path.basename(file, path.extname(file)).replace(/[-_]+/g, " "),
      }));
  });
  return NextResponse.json({ folders, assets });
}
