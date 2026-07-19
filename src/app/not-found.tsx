import { Coco } from "@/app/components/coco";

export default function NotFound() {
  return (
    <main
      aria-label="Page not found"
      className="relative isolate flex min-h-dvh w-full items-center justify-center overflow-hidden bg-[#050708] px-6 py-10 text-[#f4f1ea] sm:px-10"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_50%_35%,rgba(30,93,91,0.2),transparent_29rem),radial-gradient(circle_at_12%_90%,rgba(139,82,30,0.11),transparent_24rem),linear-gradient(160deg,#050708_0%,#090d10_55%,#050708_100%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 opacity-25 [background-image:linear-gradient(rgba(178,232,232,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(178,232,232,0.035)_1px,transparent_1px)] [background-size:72px_72px] [mask-image:linear-gradient(to_bottom,black,transparent_85%)]"
      />

      <section className="flex w-full max-w-2xl flex-col items-center text-center">
        <div className="relative h-[min(42vh,22rem)] w-full min-h-64 sm:h-[min(46vh,26rem)]">
          <Coco
            expression="sleeping"
            scale={1.5}
            center={{ x: 0.5, y: 0.52 }}
          />
        </div>

        <p className="mt-2 max-w-md font-mono text-xs tracking-[0.04em] text-white/55 sm:text-sm">
          page not found. try sailing somewhere else!
        </p>
      </section>
    </main>
  );
}
