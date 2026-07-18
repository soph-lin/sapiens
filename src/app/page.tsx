import { PixelWaveHero } from "./components/PixelWaveHero";
import IndexStartCue from "./components/landing/IndexStartCue";
import SapiensMeaning from "./components/landing/SapiensMeaning";
import SapiensVoyage from "./components/landing/SapiensVoyage";

export default function Home() {
  return (
    <div className="relative w-full bg-black">
      {/* Continuous atmosphere behind all sections — not clipped at the fold */}
      <div className="pointer-events-none absolute inset-0 z-0">
        <PixelWaveHero />
      </div>

      <section className="relative z-10 min-h-dvh w-full">
        <main className="relative flex min-h-dvh w-full items-center justify-center px-6">
          <h1 className="font-display text-[clamp(3.5rem,14vw,9rem)] font-normal tracking-[-0.03em] text-[#f4f1ea] select-none">
            sapiens
          </h1>
        </main>
        <IndexStartCue />
      </section>

      <SapiensMeaning />
      <SapiensVoyage />
    </div>
  );
}
