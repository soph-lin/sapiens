import { artist } from "./artist";
import { createAgentContext } from "./agent-context";
import { director } from "./director";
import { researcher } from "./researcher";
import { writer } from "./writer";
import type { StoryLimits } from "./config";
import type { RunUsage } from "./types";

export type AdventureRunInput = {
  topic: string;
  roles?: string[];
  instructions?: string;
  synopsis?: string;
  limits?: StoryLimits;
};

export type AdventureRunResult = {
  research: unknown;
  director: unknown;
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
  });
  const researchOutput = await researcher(input.topic, context);
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
    writer: writerOutput,
    artist: artistOutput,
    usage: context.usage.report(),
  };
}
