import ParticleWorldMap from "@/app/components/effects/worldmap/ParticleWorldMap";

/** Full-bleed particle world with etymology overlaid on the left. */
export default function SapiensMeaning() {
  return (
    <section
      aria-labelledby="sapiens-meaning-heading"
      className="relative z-10 min-h-dvh w-full overflow-hidden"
    >
      <div className="absolute inset-0">
        <ParticleWorldMap />
      </div>

      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 flex max-w-[min(22rem,42vw)] flex-col justify-center px-8 py-16 sm:px-12 lg:px-14 lg:py-24">
        <h2
          id="sapiens-meaning-heading"
          className="font-display text-[clamp(2.25rem,5vw,3.75rem)] font-normal leading-none tracking-[-0.03em] text-[#f4f1ea]"
        >
          sapiens
        </h2>
        <p className="mt-3 font-space text-[11px] tracking-[0.18em] text-white/45">
          /ˈseɪ.pi.ənz/
        </p>
        <p className="mt-8 max-w-[16rem] font-space text-[13px] leading-relaxed tracking-[0.01em] text-white/50 lowercase">
          from latin sapiens — wise, or capable of discerning.
        </p>
      </div>
    </section>
  );
}
