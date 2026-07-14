import { Coco, Zzz } from "../components/coco";

export default function HomeLounge() {
  return (
    <div className="relative min-h-dvh w-full overflow-hidden bg-black">
      <Coco asleep />
      <Zzz />
      <main className="relative z-10 flex min-h-dvh w-full flex-col items-center justify-end px-6 pb-[12vh] pointer-events-none">
        <h1 className="font-display text-[clamp(2.5rem,10vw,6rem)] font-normal tracking-[-0.03em] text-[#f4f1ea] select-none">
          sapiens
        </h1>
        <p className="mt-3 max-w-sm text-center font-sans text-sm tracking-wide text-[#f4f1ea]/60">
          rest a moment. the world can wait.
        </p>
      </main>
    </div>
  );
}
