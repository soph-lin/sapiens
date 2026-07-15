export default function Loading() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0d1716] px-6 text-[#f4ead8]">
      <div className="w-full max-w-sm rounded-2xl border border-[#d2b58b]/20 bg-[#15110d]/95 p-6 text-center shadow-2xl">
        <p className="font-space text-[10px] uppercase tracking-[0.25em] text-[#d9a85c]">Sapiens · world prototype</p>
        <h1 className="mt-3 font-display text-3xl">Loading the clearing</h1>
        <div className="mt-6 h-2 overflow-hidden rounded-full bg-[#2b4039]"><div className="h-full w-1/3 animate-pulse rounded-full bg-[#d9a85c]" /></div>
        <p className="mt-3 font-space text-[10px] uppercase tracking-[0.14em] text-[#907e69]">Preparing assets</p>
      </div>
    </main>
  );
}
