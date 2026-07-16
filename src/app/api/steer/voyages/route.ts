import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function researcherSource(value: unknown): string | null {
  let candidate = value;
  if (typeof candidate === "string") {
    try { candidate = JSON.parse(candidate); } catch { return null; }
  }
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return null;
  const articleUrl = (candidate as Record<string, unknown>).articleUrl;
  return typeof articleUrl === "string" && articleUrl.trim() ? articleUrl : null;
}

function objectValue(value: unknown): Record<string, unknown> | null {
  let candidate = value;
  if (typeof candidate === "string") {
    try { candidate = JSON.parse(candidate); } catch { return null; }
  }
  return candidate && typeof candidate === "object" && !Array.isArray(candidate)
    ? candidate as Record<string, unknown>
    : null;
}

function starCharacterName(...outputs: unknown[]): string | null {
  for (const output of outputs) {
    const record = objectValue(output);
    const direct = record?.starCharacter;
    const nested = objectValue(record?.need_assets)?.starCharacter;
    const candidate = objectValue(direct ?? nested);
    if (typeof candidate?.name === "string" && candidate.name.trim()) return candidate.name.trim();
  }
  return null;
}

function assetDataUrl(asset: { mimeType: string; data: Uint8Array } | null): string | null {
  return asset ? `data:${asset.mimeType};base64,${Buffer.from(asset.data).toString("base64")}` : null;
}

function assetFrameDataUrls(
  frames: Array<{ frameKey: string; mimeType: string; data: Uint8Array }>,
) {
  return Object.fromEntries(
    frames.map((frame) => [
      frame.frameKey,
      `data:${frame.mimeType};base64,${Buffer.from(frame.data).toString("base64")}`,
    ]),
  );
}

export async function GET() {
  try {
    const runs = await prisma.storyGenRun.findMany({
      orderBy: { startedAt: "desc" },
      select: {
      id: true,
      slug: true,
      status: true,
      steering: true,
      storyConfig: true,
      modelConfig: true,
      researcherOutput: true,
      directorOutput: true,
      writerOutput: true,
      artistOutput: true,
      startedAt: true,
      finishedAt: true,
        error: true,
      story: {
        select: {
          slug: true,
          topic: true,
          characters: {
            select: {
              id: true,
              name: true,
              description: true,
              asset: { select: { mimeType: true, data: true } },
              spriteAsset: {
                select: {
                  mimeType: true,
                  data: true,
                  frames: { select: { frameKey: true, mimeType: true, data: true } },
                },
              },
            },
          },
        },
      },
      },
    });

    return NextResponse.json({ runs: runs.map((run) => {
    const {
      researcherOutput,
      directorOutput,
      writerOutput,
      artistOutput,
      story,
      ...summary
    } = run;
    const missing = [
      ["run slug", summary.slug],
      ["story", story],
      ["researcher output", researcherOutput],
      ["director output", directorOutput],
      ["writer output", writerOutput],
      ["artist output", artistOutput],
    ].filter(([, value]) => value === null).map(([label]) => label);
    return {
      ...summary,
      story: story ? { slug: story.slug, topic: story.topic } : null,
      source: researcherSource(researcherOutput),
      replayable: missing.length === 0,
      missing,
      starCharacter: (() => {
        const name = starCharacterName(directorOutput, writerOutput);
        if (!name || !story) return null;
        const character = story.characters.find(
          (candidate) => candidate.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
        );
        if (!character) return null;
        return {
          characterId: character.id,
          name: character.name,
          description: character.description,
          portraitUrl: assetDataUrl(character.asset),
          spriteUrl: assetDataUrl(character.spriteAsset),
          spriteFrames: character.spriteAsset
            ? assetFrameDataUrls(character.spriteAsset.frames)
            : {},
        };
      })(),
    };
    }) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load voyages" }, { status: 500 });
  }
}
