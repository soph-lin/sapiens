import { PixelWaveHero } from "./components/PixelWaveHero";
import IndexStartCue from "./components/landing/IndexStartCue";

export default function Home() {
  return (
    <div className="relative min-h-dvh w-full overflow-hidden bg-black">
      <PixelWaveHero />
      <main className="relative z-10 flex min-h-dvh w-full items-center justify-center px-6">
        <h1 className="font-display text-[clamp(3.5rem,14vw,9rem)] font-normal tracking-[-0.03em] text-[#f4f1ea] select-none">
          sapiens
        </h1>
      </main>
      <IndexStartCue />
    </div>
  );
}
