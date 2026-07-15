"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import type { CatalogAsset } from "@/lib/map/asset-catalog";
import { DEFAULT_ANIMATION_PLAYBACK } from "@/lib/map/animation-data";
import PlayerPicker from "./PlayerPicker";

const FILTER_STORAGE_KEY = "sapiens-map-asset-categories";

function Frame({ asset, row, column }: { asset: CatalogAsset; row: number; column: number }) {
  const scale = Math.min(3, Math.max(1, 72 / Math.max(asset.frameWidth, asset.frameHeight)));
  return <div aria-label={`${asset.label} frame ${row}:${column}`} className="flex h-[96px] w-[96px] shrink-0 items-center justify-center rounded-xl border border-[#d2b58b]/20 bg-[#f4ead8]"><div style={{ width: asset.frameWidth * scale, height: asset.frameHeight * scale, backgroundImage: `url("${asset.path}")`, backgroundPosition: `-${column * asset.frameWidth * scale}px -${row * asset.frameHeight * scale}px`, backgroundRepeat: "no-repeat", backgroundSize: `${asset.columns * asset.frameWidth * scale}px ${asset.rows * asset.frameHeight * scale}px` }} /></div>;
}

function Animation({ asset, animation }: { asset: CatalogAsset; animation: CatalogAsset["animations"][number] }) {
  const [frameIndex, setFrameIndex] = useState(0);
  const frameRate = animation.playback?.frameRate ?? DEFAULT_ANIMATION_PLAYBACK.frameRate;
  useEffect(() => {
    if (animation.frames.length < 2) return;
    const timer = window.setInterval(() => setFrameIndex((index) => (index + 1) % animation.frames.length), 1000 / frameRate);
    return () => window.clearInterval(timer);
  }, [animation.frames.length, frameRate]);
  const frame = animation.frames[frameIndex % animation.frames.length];
  return frame ? <Frame asset={asset} row={frame.row} column={frame.column} /> : null;
}

function AssetType({ asset }: { asset: CatalogAsset }) {
  const [open, setOpen] = useState(false);
  return <details open={open} onToggle={(event) => setOpen(event.currentTarget.open)} className="rounded-xl border border-[#d2b58b]/10 bg-[#19130f]"><summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 px-4 py-3"><span className="font-display text-xl">{asset.label}</span><span className="font-space text-[10px] uppercase tracking-[0.12em] text-[#907e69]">{asset.frameWidth}×{asset.frameHeight} · {asset.columns}×{asset.rows} cells</span></summary><div className="border-t border-[#d2b58b]/10 p-4"><code className="block break-all text-xs text-[#907e69]">{asset.path}</code>{asset.note && <p className="mt-3 rounded-lg bg-[#d9a85c]/10 px-3 py-2 text-xs text-[#e6bd7a]">Curator note: {asset.note}</p>}{asset.kind === "composite-object" ? <div className="mt-5 rounded-xl bg-[#f4ead8] p-4"><Image src={asset.path} alt={asset.label} width={asset.frameWidth} height={asset.frameHeight} className="max-h-72 max-w-full object-contain" /></div> : <div className="mt-5 space-y-5">{asset.animations.map((animation) => <div key={animation.key}><div className="mb-2 flex items-center gap-3"><span className="rounded-full bg-[#d9a85c]/15 px-3 py-1 font-space text-[10px] uppercase tracking-[0.12em] text-[#e6bd7a]">{animation.label}</span><span className="font-space text-[10px] text-[#806f5b]">{animation.frames.length} occupied frames</span></div><div className="flex gap-2 overflow-x-auto pb-2">{asset.preview === "animation" ? <Animation asset={asset} animation={animation} /> : animation.frames.map((frame) => <Frame key={`${frame.row}-${frame.column}`} asset={asset} row={frame.row} column={frame.column} />)}</div></div>)}</div>}</div></details>;
}

export default function AssetSheetPreview({ assets }: { assets: CatalogAsset[] }) {
  const [query, setQuery] = useState("");
  const categories = useMemo(() => Array.from(new Set(assets.map((asset) => asset.category))), [assets]);
  const [selectedCategories, setSelectedCategories] = useState<string[] | null>(null);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      try {
        const saved = JSON.parse(window.localStorage.getItem(FILTER_STORAGE_KEY) ?? "null");
        setSelectedCategories(Array.isArray(saved) ? categories.filter((category) => saved.includes(category)) : categories);
      } catch {
        setSelectedCategories(categories);
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [categories]);

  useEffect(() => {
    if (selectedCategories !== null) window.localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(selectedCategories));
  }, [selectedCategories]);

  const visibleAssets = selectedCategories === null ? assets : assets.filter((asset) => selectedCategories.includes(asset.category));
  const groups = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const filtered = normalizedQuery ? visibleAssets.filter((asset) => [asset.label, asset.category, asset.type, asset.path, ...asset.animations.map((animation) => animation.label)].join(" ").toLowerCase().includes(normalizedQuery)) : visibleAssets;
    return Object.entries(filtered.reduce<Record<string, CatalogAsset[]>>((grouped, asset) => { (grouped[asset.category] ??= []).push(asset); return grouped; }, {}));
  }, [query, visibleAssets]);

  function setAllCategories() {
    setSelectedCategories(categories);
  }

  function setNoCategories() {
    setSelectedCategories([]);
  }

  function toggleCategory(category: string) {
    setSelectedCategories((current) => {
      const active = current ?? categories;
      const next = active.includes(category) ? active.filter((item) => item !== category) : [...active, category];
      return categories.filter((item) => next.includes(item));
    });
  }

  return <main className="min-h-screen bg-[#15110d] px-6 py-10 text-[#f4ead8] sm:px-10"><div className="mx-auto max-w-7xl"><div className="flex flex-wrap items-start justify-between gap-6"><div><p className="font-space text-xs uppercase tracking-[0.25em] text-[#d9a85c]">Asset / Phaser role</p><h1 className="mt-3 font-display text-5xl">Sprite-sheet lab</h1></div><label className="flex w-full max-w-sm items-center gap-3 rounded-full border border-[#d2b58b]/20 bg-[#211a14] px-4 py-3 text-[#c9bda9] sm:w-80"><span className="font-space text-xs text-[#d9a85c]">⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search sprites, folders, labels…" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[#806f5b]" aria-label="Search sprites" /></label></div><div className="mt-6 flex flex-wrap gap-2" aria-label="Filter asset sections"><button type="button" onClick={setAllCategories} aria-pressed={selectedCategories === null || selectedCategories.length === categories.length} className="rounded-full border border-[#d9a85c]/40 bg-[#d9a85c]/15 px-3 py-2 font-space text-[10px] uppercase tracking-[0.12em] text-[#e6bd7a]">All</button><button type="button" onClick={setNoCategories} aria-pressed={selectedCategories?.length === 0} className="rounded-full border border-[#d2b58b]/20 px-3 py-2 font-space text-[10px] uppercase tracking-[0.12em] text-[#907e69]">None</button>{categories.map((category) => { const active = selectedCategories === null || selectedCategories.includes(category); return <button key={category} type="button" onClick={() => toggleCategory(category)} aria-pressed={active} className={`rounded-full border px-3 py-2 font-space text-[10px] uppercase tracking-[0.12em] ${active ? "border-[#d9a85c]/40 bg-[#d9a85c]/15 text-[#e6bd7a]" : "border-[#d2b58b]/20 text-[#806f5b]"}`}>{category}</button>; })}</div><p className="mt-4 max-w-3xl text-sm leading-7 text-[#c9bda9]">Every preview and the playable map now consume the same occupied frame and animation metadata.</p><p className="mt-3 font-space text-[10px] uppercase tracking-[0.14em] text-[#806f5b]">{query ? `${groups.reduce((count, [, categoryAssets]) => count + categoryAssets.length, 0)} matching sprite types` : `${visibleAssets.length} sprite types`}</p><div className="mt-8 space-y-4">{groups.length > 0 ? groups.map(([category, categoryAssets]) => <details key={category} open={Boolean(query)} className="rounded-2xl border border-[#d2b58b]/15 bg-[#211a14] p-5 sm:p-7"><summary className="cursor-pointer list-none font-display text-4xl">{category}<span className="ml-3 font-space text-xs text-[#907e69]">{categoryAssets.length} sprite types</span></summary>{category === "Player" && <PlayerPicker assets={assets} />}<div className="mt-6 space-y-3">{categoryAssets.map((asset) => <AssetType key={asset.key} asset={asset} />)}</div></details>) : <div className="rounded-2xl border border-[#d2b58b]/15 bg-[#211a14] p-8 text-sm text-[#b7a992]">No sprites match “{query}”.</div>}</div></div></main>;
}
