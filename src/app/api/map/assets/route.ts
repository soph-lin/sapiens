import { NextResponse } from "next/server";
import { getAssetCatalog, getMapAssets } from "@/lib/map/asset-catalog";

export const runtime = "nodejs";

export async function GET() {
  const assets = getAssetCatalog();
  return NextResponse.json({ assets, mapAssets: getMapAssets(assets) }, {
    headers: { "Cache-Control": "public, max-age=3600" },
  });
}
