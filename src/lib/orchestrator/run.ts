import { artist } from "./agent/artist";
import { createAgentContext } from "./agent/agent-context";
import { director, type AdventurePlan } from "./agent/director";
import { researcher } from "./agent/researcher";
import { writer } from "./agent/writer";
import type { StoryLimits } from "./config";
import type { RunUsage } from "./types";
import type { FlourishConfig } from "./agent/flourish";

export type AdventureRunInput = {
  topic: string;
  roles?: string[];
  instructions?: string;
  synopsis?: string;
  limits?: StoryLimits;
  flourish?: Partial<FlourishConfig>;
  furtherReading?: boolean;
};

export type AdventureRunResult = {
  research: unknown;
  director: unknown;
  synopsis: AdventurePlan["synopsis"];
  writer: unknown;
  artist: unknown;
  usage: RunUsage;
};

export async function runAdventurePipeline(
  input: AdventureRunInput,
): Promise<AdventureRunResult> {
  const context = createAgentContext({
    limits: input.limits,
    directorSteering: input.synopsis ?? input.instructions,
    flourish: {
      ...input.flourish,
      ...(input.furtherReading === undefined ? {} : { furtherReading: input.furtherReading }),
    },
  });
  const researchOutput = await researcher(
    {
      historicalEvent: input.topic,
      plotDirection: input.synopsis ?? input.instructions,
    },
    context,
  );
  const directorOutput = await director(
    researchOutput as Record<string, unknown>,
    context,
  );
  const writerOutput = await writer(
    directorOutput as Record<string, unknown>,
    context,
  );
  const artistOutput = await artist(
    writerOutput.need_assets,
    context,
  );

  return {
    research: researchOutput,
    director: directorOutput,
    synopsis: directorOutput.synopsis,
    writer: writerOutput,
    artist: artistOutput,
    usage: context.usage.report(),
  };
}
