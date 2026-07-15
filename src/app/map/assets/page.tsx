import AssetSheetPreview from "@/app/components/map/AssetSheetPreview";
import { getAssetCatalog } from "@/lib/map/asset-catalog";

export default function MapAssetsPage() {
  return <AssetSheetPreview assets={getAssetCatalog()} />;
}
