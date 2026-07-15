import TopDownMap from "@/app/components/map/TopDownMap";

export default async function MapPage() {
  return (
    <main className="min-h-screen bg-[#0d1716] px-5 py-8 text-[#f4ead8] sm:px-10">
      <div className="mx-auto max-w-6xl">
        <p className="font-space text-xs uppercase tracking-[0.25em] text-[#d9a85c]">Sapiens · world prototype</p>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div><h1 className="font-display text-5xl">The first clearing</h1><p className="mt-2 text-sm text-[#b7c2b6]">Arrow keys or WASD to explore the grid.</p></div>
          <a className="font-space text-xs uppercase tracking-[0.12em] text-[#e6bd7a] underline" href="/map/assets">Open sprite-sheet lab →</a>
        </div>
        <div className="mt-8"><TopDownMap assets={[]} /></div>
      </div>
    </main>
  );
}
