"use client";

import { useEffect, useState } from "react";
import SparklingStars from "@/app/components/effects/SparklingStars";
import ParticleSolarSystem, {
  type SolarPlanetSpec,
} from "@/app/components/effects/solarsystem/ParticleSolarSystem";

/** How long each planet holds the near focus before the next. */
const CYCLE_PLANET = 4800;

type PlanetStory = {
  verb: string;
  description: string;
  body: SolarPlanetSpec;
};

/**
 * One story per world — verbs lead; lines stay lowercase and unpunctuated.
 * Planets share one orbit radius and UI size; phases space them evenly.
 */
const RING_ORBIT = 0.72;
const PLANET_STORIES: PlanetStory[] = [
  {
    verb: "embark",
    description: "on a journey like no other back in time",
    body: { id: "mercury", orbit: RING_ORBIT, size: 1, phase: 0 },
  },
  {
    verb: "imagine",
    description: "worlds that have long since disappeared",
    body: { id: "venus", orbit: RING_ORBIT, size: 1, phase: Math.PI / 4 },
  },
  {
    verb: "log",
    description: "discoveries from voyages",
    body: { id: "earth", orbit: RING_ORBIT, size: 1, phase: Math.PI / 2 },
  },
  {
    verb: "discover",
    description: "what evidence still sleeps in plain sight",
    body: { id: "mars", orbit: RING_ORBIT, size: 1, phase: (3 * Math.PI) / 4 },
  },
  {
    verb: "sail",
    description: "between harbors of memory and myth",
    body: { id: "jupiter", orbit: RING_ORBIT, size: 1, phase: Math.PI },
  },
  {
    verb: "gather",
    description: "stars that tell tales from their past lives",
    body: {
      id: "saturn",
      orbit: RING_ORBIT,
      size: 1,
      phase: (5 * Math.PI) / 4,
    },
  },
  {
    verb: "return",
    description: "altered by every shore you visit",
    body: {
      id: "uranus",
      orbit: RING_ORBIT,
      size: 1,
      phase: (3 * Math.PI) / 2,
    },
  },
  {
    verb: "wonder",
    description: "at all that remains to be known",
    body: {
      id: "neptune",
      orbit: RING_ORBIT,
      size: 1,
      phase: (7 * Math.PI) / 4,
    },
  },
];

const PLANET_BODIES = PLANET_STORIES.map((story) => story.body);

/** Solar system exhibit — focused planet leads the right-hand verse. */
export default function SapiensVoyage() {
  const [focusIndex, setFocusIndex] = useState(0);

  useEffect(() => {
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const ms = reduceMotion ? CYCLE_PLANET * 1.6 : CYCLE_PLANET;
    const id = window.setInterval(() => {
      setFocusIndex((i) => (i + 1) % PLANET_STORIES.length);
    }, ms);
    return () => window.clearInterval(id);
  }, []);

  const story = PLANET_STORIES[focusIndex];

  return (
    <section
      aria-labelledby="sapiens-voyage-heading"
      className="relative z-10 grid min-h-dvh w-full grid-cols-1 lg:grid-cols-[minmax(0,1.15fr)_minmax(14rem,0.85fr)]"
    >
      <SparklingStars contained />

      <h2 id="sapiens-voyage-heading" className="sr-only">
        Voyage
      </h2>

      <div className="relative z-[1] min-h-[55vh] lg:min-h-dvh">
        <ParticleSolarSystem
          planets={PLANET_BODIES}
          focusIndex={focusIndex}
          cycleMs={CYCLE_PLANET}
        />
      </div>

      <div className="relative z-[1] flex flex-col justify-center px-8 py-16 sm:px-12 lg:px-16 lg:py-24">
        <div
          key={story.verb}
          className="max-w-[18rem] animate-[voyage-fade_520ms_ease-out]"
          aria-live="polite"
        >
          <p className="font-space text-[11px] uppercase tracking-[0.22em] text-white/45">
            {story.verb}
          </p>
          <p className="mt-5 font-display text-[clamp(1.35rem,2.4vw,1.85rem)] leading-snug tracking-[-0.02em] text-[#f4f1ea]/88 lowercase">
            {story.description}
          </p>
        </div>
      </div>
    </section>
  );
}
