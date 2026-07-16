"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import {
  buildAtlasGrid,
  buildLayoutTiles,
  layoutColumnCount,
  layoutRowCount,
  MAP_LAYOUT_TEMPLATES,
  REGION_COLUMNS,
  REGION_NOTES,
  SHEET_COLUMNS,
  SHEET_ROWS,
  TILE_SOURCE_SIZE,
  type AtlasTile,
  type LayoutZone,
  type MapLayoutTemplate,
  type MapRegion,
  type PlacedMapTile,
} from "@/lib/game/map";

type TabId = "grid" | MapLayoutTemplate["id"];

const GRID_TILE_SIZE = 76;
const MAP_TILE_SIZE = 34;
const EVAL_TILE_SIZE = 18;
const TABS: Array<{ id: TabId; label: string }> = [
  { id: "grid", label: "Grid" },
  ...MAP_LAYOUT_TEMPLATES.map((layout) => ({
    id: layout.id,
    label: layout.name.replace("Layout ", "layout "),
  })),
];

const REGION_ACCENTS: Record<MapRegion, string> = {
  1: "border-lime-200/70 bg-lime-200/8",
  2: "border-amber-200/55 bg-amber-200/8",
  3: "border-cyan-200/55 bg-cyan-200/8",
  4: "border-rose-200/70 bg-rose-200/8",
};

export default function MapPage() {
  const [activeTab, setActiveTab] = useState<TabId>("grid");
  const activeLayout = MAP_LAYOUT_TEMPLATES.find(
    (layout) => layout.id === activeTab,
  );

  return (
    <main className="min-h-dvh overflow-hidden bg-[#0c0805] bg-[radial-gradient(circle_at_20%_0%,rgba(151,92,38,0.28),transparent_32rem),radial-gradient(circle_at_100%_30%,rgba(70,88,53,0.24),transparent_28rem)] px-5 py-8 text-[#f7ead1] sm:px-8">
      <header className="mx-auto max-w-7xl">
        <p className="font-mono text-xs uppercase tracking-[0.32em] text-amber-200/60">
          Floors And Walls
        </p>
        <h1 className="mt-3 font-display text-5xl tracking-[-0.04em] sm:text-6xl">
          Map drafting table
        </h1>
        <p className="mt-4 max-w-3xl text-sm leading-6 text-[#d8c6a7]">
          Inspect the numbered atlas regions, then switch between larger room
          templates. Region 1 and region 4 stay on the outside ends; regions 2
          and 3 repeat through the middle of a room span.
        </p>
      </header>

      <AllLayoutsEval />

      <section className="mx-auto mt-7 max-w-7xl">
        <div
          aria-label="Map view picker"
          className="flex flex-wrap gap-2 rounded-2xl border border-amber-100/10 bg-[#150f09]/80 p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
          role="tablist"
        >
          {TABS.map((tab) => {
            const isActive = tab.id === activeTab;

            return (
              <button
                aria-selected={isActive}
                className={`rounded-xl px-4 py-2 font-mono text-xs uppercase tracking-[0.18em] transition ${
                  isActive
                    ? "bg-[#f7ead1] text-[#1a120a] shadow-[0_8px_24px_rgba(247,234,209,0.18)]"
                    : "text-[#cdbb9c] hover:bg-white/8 hover:text-[#f7ead1]"
                }`}
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                role="tab"
                type="button"
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </section>

      {activeLayout ? <LayoutView layout={activeLayout} /> : <GridView />}
    </main>
  );
}

function AllLayoutsEval() {
  return (
    <section className="mx-auto mt-7 max-w-7xl rounded-3xl border border-cyan-100/15 bg-[#07100f]/80 p-5 shadow-[0_24px_80px_rgba(0,0,0,0.34)]">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-mono text-lg font-bold uppercase tracking-[0.2em]">
            Screenshot eval
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[#c7d8d4]">
            Temporary static canvases for screenshot review. These use the same
            renderer as the tabs below.
          </p>
        </div>
        <p className="font-mono text-xs text-cyan-100/60">temporary</p>
      </div>

      <div className="space-y-7">
        {MAP_LAYOUT_TEMPLATES.map((layout) => (
          <LayoutPanel key={layout.id} layout={layout} variant="eval" />
        ))}
      </div>
    </section>
  );
}

function GridView() {
  const atlasGrid = useMemo(() => buildAtlasGrid(), []);

  return (
    <section className="mx-auto mt-5 max-w-7xl rounded-3xl border border-amber-100/15 bg-[#120d08]/92 p-5 shadow-[0_24px_80px_rgba(0,0,0,0.38)]">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-mono text-lg font-bold uppercase tracking-[0.2em]">
            Grid
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#d8c6a7]">
            The full 18 x 9 floor/wall slice grid. Every tile shows its sheet
            label, exported filename, region, role, and sheet row/column.
          </p>
        </div>
        <p className="font-mono text-xs text-amber-100/60">
          {SHEET_COLUMNS} columns x {SHEET_ROWS} rows
        </p>
      </div>

      <div className="overflow-auto border border-white/10 bg-[#070504]">
        <div
          className="grid w-max gap-0"
          style={{
            gridTemplateColumns: `repeat(${SHEET_COLUMNS}, ${GRID_TILE_SIZE}px)`,
          }}
        >
          {atlasGrid.flat().map((tile) => (
            <AtlasGridTile key={tile.label} tile={tile} />
          ))}
        </div>
      </div>

      <div className="mt-5 grid gap-3 text-sm text-[#d8c6a7] md:grid-cols-4">
        {([1, 2, 3, 4] as const).map((region) => (
          <div
            className={`rounded-2xl border px-4 py-3 ${REGION_ACCENTS[region]}`}
            key={region}
          >
            <h3 className="font-mono text-xs uppercase tracking-[0.2em] text-[#f7ead1]">
              Region {region}
            </h3>
            <p className="mt-2">
              Columns {REGION_COLUMNS[region].join(", ")}.{" "}
              {REGION_NOTES[region]}.
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

function LayoutView({ layout }: { layout: MapLayoutTemplate }) {
  return <LayoutPanel layout={layout} variant="tab" />;
}

function LayoutPanel({
  layout,
  variant,
}: {
  layout: MapLayoutTemplate;
  variant: "eval" | "tab";
}) {
  const tiles = useMemo(() => buildLayoutTiles(layout), [layout]);
  const columns = layoutColumnCount(layout);
  const rows = layoutRowCount(layout);
  const tileSize = variant === "eval" ? EVAL_TILE_SIZE : MAP_TILE_SIZE;

  return (
    <section className="mx-auto mt-5 max-w-7xl rounded-3xl border border-amber-100/15 bg-[#120d08]/92 p-5 shadow-[0_24px_80px_rgba(0,0,0,0.38)]">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-mono text-lg font-bold uppercase tracking-[0.2em]">
            {layout.name}
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[#d8c6a7]">
            {layout.description}
          </p>
        </div>
        <p className="font-mono text-xs text-amber-100/60">
          {columns} x {rows} template cells
        </p>
      </div>

      <div className="overflow-auto rounded-2xl border border-white/10 bg-[#070504] p-4">
        <div
          className="grid w-max gap-0 bg-[linear-gradient(to_right,rgba(247,234,209,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(247,234,209,0.05)_1px,transparent_1px)]"
          data-map-canvas={`${layout.id}-${variant}`}
          style={{
            backgroundSize: `${tileSize}px ${tileSize}px`,
            gridTemplateColumns: `repeat(${columns}, ${tileSize}px)`,
            gridTemplateRows: `repeat(${rows}, ${tileSize}px)`,
            minHeight: rows * tileSize,
            minWidth: columns * tileSize,
          }}
        >
          {tiles.map((tile) => (
            <MapTile
              key={`${tile.zoneName}-${tile.x}-${tile.y}`}
              tile={tile}
              tileSize={tileSize}
            />
          ))}
        </div>
      </div>

      <div className="mt-5 grid gap-3 text-sm text-[#d8c6a7] lg:grid-cols-4">
        {layout.zones.map((zone) => (
          <ZoneCard key={zone.mark} zone={zone} />
        ))}
      </div>
    </section>
  );
}

function AtlasGridTile({ tile }: { tile: AtlasTile }) {
  return (
    <figure
      className={`relative overflow-hidden border-r border-b ${REGION_ACCENTS[tile.region]}`}
      title={`sheet ${tile.label}, ${tile.fileName}, row ${tile.sheetRow}, column ${tile.sheetColumn}`}
    >
      <Image
        alt=""
        aria-hidden
        className="absolute inset-0 h-full w-full opacity-70 [image-rendering:pixelated]"
        height={TILE_SOURCE_SIZE}
        src={`/assets/floorsandwalls/${tile.fileName}`}
        unoptimized
        width={TILE_SOURCE_SIZE}
      />
      <figcaption className="relative flex h-[76px] flex-col justify-between bg-black/34 p-1.5 font-mono text-[9px] leading-tight text-[#fff5d8] shadow-[inset_0_0_18px_rgba(0,0,0,0.4)]">
        <span className="text-[13px] font-bold">{tile.label}</span>
        <span>{tile.fileName}</span>
        <span>
          R{tile.region} {tile.role}
        </span>
        <span>
          r{tile.sheetRow} c{tile.sheetColumn}
        </span>
      </figcaption>
    </figure>
  );
}

function MapTile({
  tile,
  tileSize,
}: {
  tile: PlacedMapTile;
  tileSize: number;
}) {
  return (
    <div
      className="relative overflow-hidden bg-[#080604]"
      style={{
        gridColumn: `${tile.x} / span 1`,
        gridRow: `${tile.y} / span 1`,
        height: tileSize,
        width: tileSize,
      }}
      title={`${tile.zoneName}: sheet ${tile.label} / ${tile.fileName} / region ${tile.region} / ${tile.role}`}
    >
      <Image
        alt=""
        aria-hidden
        className="h-full w-full scale-[1.18] [image-rendering:pixelated]"
        height={TILE_SOURCE_SIZE}
        src={`/assets/floorsandwalls/${tile.fileName}`}
        unoptimized
        width={TILE_SOURCE_SIZE}
      />
    </div>
  );
}

function ZoneCard({ zone }: { zone: LayoutZone }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/4 px-4 py-3">
      <h3 className="font-mono text-xs uppercase tracking-[0.2em] text-amber-100/75">
        {zone.mark} / {zone.name}
      </h3>
      <p className="mt-2">Base region {zone.region}</p>
      <p className="mt-1 text-xs text-[#a9987a]">{zone.note}</p>
    </div>
  );
}
