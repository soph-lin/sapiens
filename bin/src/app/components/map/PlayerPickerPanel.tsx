"use client";

import { useState } from "react";
import type { CatalogAsset } from "@/lib/map/asset-catalog";
import PlayerPicker from "./PlayerPicker";

export default function PlayerPickerPanel({ assets }: { assets: CatalogAsset[] }) {
  const [open, setOpen] = useState(false);
  return <><button type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)} className="absolute right-4 top-4 z-20 rounded-full border border-[#d9a85c]/40 bg-[#211a14]/95 px-4 py-3 font-space text-[10px] uppercase tracking-[0.14em] text-[#e6bd7a] shadow-lg">✦ Player outfit</button>{open && <div className="absolute inset-x-4 top-16 z-20 max-h-[calc(100%-5rem)] overflow-y-auto rounded-2xl border border-[#d9a85c]/30 bg-[#15110d]/[.98] p-2 shadow-2xl"><button type="button" onClick={() => setOpen(false)} className="float-right px-3 py-2 text-sm text-[#c9bda9]" aria-label="Close player outfit picker">×</button><PlayerPicker assets={assets} /></div>}</>;
}
