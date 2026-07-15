"use client";

import { useEffect, useMemo, useState } from "react";
import type { CatalogAsset } from "@/lib/map/asset-catalog";
import { HORSE_MOUNT_PLAYER_ROWS, PLAYER_ANIMATION_ROWS } from "@/lib/map/assets/player";
import { DEFAULT_ANIMATION_PLAYBACK } from "@/lib/map/animation-data";

export default function PlayerPicker({ assets }: { assets: CatalogAsset[] }) {
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [row, setRow] = useState(0);
  const [frameIndex, setFrameIndex] = useState(0);
  const groups = useMemo(() => [
    ["base", "Player_Base"], ["hair", "Head/Hair_"], ["helmet", "Head/Plate_"], ["chest", "Chest/"], ["legs", "Legs/"], ["feet", "Feet/"], ["accessories", "Accessories/"], ["tools", "Tools/"], ["mounts", "Player_Mounts/"],
  ].map(([key, match]) => ({ key, label: key === "base" ? "Body" : key[0].toUpperCase() + key.slice(1), assets: assets.filter((asset) => asset.category === "Player" && asset.relativePath.includes(`Player/${match}`)) })).filter((group) => group.assets.length > 0), [assets]);
  const selected = groups.flatMap((group) => {
    const selectedKey = choices[group.key];
    if (selectedKey === "") return [];
    if (selectedKey) return group.assets.filter((asset) => asset.key === selectedKey);
    return group.key === "base" && group.assets[0] ? [group.assets[0]] : [];
  });
  const base = selected.find((asset) => asset.relativePath.includes("Player/Player_Base/")) ?? selected[0];
  const animation = base?.animations.find((item) => item.frames[0]?.row === row) ?? base?.animations[0];
  const frames = animation?.frames ?? [];
  const frameRate = animation?.playback?.frameRate ?? DEFAULT_ANIMATION_PLAYBACK.frameRate;
  const renderableLayers = selected.flatMap((asset) => {
    const isTool = asset.relativePath.includes("Player/Tools/");
    const isHorse = asset.relativePath.includes("Player/Player_Mounts/Horse/");
    const horseRow = isHorse ? HORSE_MOUNT_PLAYER_ROWS.indexOf(PLAYER_ANIMATION_ROWS[row] as typeof HORSE_MOUNT_PLAYER_ROWS[number]) : -1;
    if (isHorse && horseRow < 0) return [];
    const layer = asset.animations.find((item) => item.frames[0]?.row === (horseRow >= 0 ? horseRow : row)) ?? (isTool ? asset.animations[0] : undefined);
    if (!layer?.frames.length) return [];
    const frame = layer.frames[frameIndex % layer.frames.length];
    return [{ asset, frame }];
  });
  useEffect(() => {
    if (frames.length < 2) return;
    const timer = window.setInterval(() => setFrameIndex((index) => (index + 1) % frames.length), 1000 / frameRate);
    return () => window.clearInterval(timer);
  }, [frames.length, frameRate]);
  return <div className="mt-6 rounded-2xl border border-[#d9a85c]/20 bg-[#17110d] p-5"><div className="flex flex-wrap items-start justify-between gap-5"><div><p className="font-space text-[10px] uppercase tracking-[0.18em] text-[#d9a85c]">Synchronized layer preview</p><h3 className="mt-2 font-display text-3xl">Build an outfit</h3><p className="mt-1 max-w-xl text-sm text-[#b7a992]">All layers now read the same shared animation frame metadata. Empty cells are never selected.</p></div><label className="font-space text-[10px] uppercase tracking-[0.12em] text-[#907e69]">Animation row<select value={row} onChange={(event) => setRow(Number(event.target.value))} className="mt-2 block rounded-lg border border-[#d2b58b]/20 bg-[#211a14] px-3 py-2 text-xs normal-case tracking-normal text-[#f4ead8]">{(base?.animations ?? []).map((item) => <option key={item.key} value={item.frames[0]?.row ?? 0}>row {item.frames[0]?.row ?? 0} · {item.label}</option>)}</select></label></div><div className="mt-6 grid gap-5 lg:grid-cols-[192px_1fr]"><div className="relative flex h-48 w-48 items-center justify-center overflow-hidden rounded-xl bg-[#f4ead8]">{renderableLayers.map(({ asset, frame }, index) => <div key={asset.key} className="pointer-events-none absolute h-48 w-48 bg-no-repeat" style={{ zIndex: index, backgroundImage: `url("${asset.path}")`, backgroundPosition: `-${frame.column * 192}px -${frame.row * 192}px`, backgroundSize: `${asset.columns * 192}px ${asset.rows * 192}px` }} />)}</div><div className="grid gap-3 sm:grid-cols-2">{groups.map((group) => <label key={group.key} className="font-space text-[10px] uppercase tracking-[0.12em] text-[#907e69]">{group.label}<select value={choices[group.key] ?? (group.key === "base" ? group.assets[0]?.key : "")} onChange={(event) => setChoices((current) => ({ ...current, [group.key]: event.target.value }))} className="mt-2 block w-full rounded-lg border border-[#d2b58b]/20 bg-[#211a14] px-3 py-2 text-xs normal-case tracking-normal text-[#f4ead8]">{group.key !== "base" && <option value="">None</option>}{group.assets.map((asset) => <option key={asset.key} value={asset.key}>{asset.label}</option>)}</select></label>)}</div></div></div>;
}
