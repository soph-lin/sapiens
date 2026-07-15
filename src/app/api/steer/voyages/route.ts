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
      story: { select: { slug: true, topic: true } },
      },
    });

    return NextResponse.json({ runs: runs.map((run) => {
    const {
      researcherOutput,
      directorOutput,
      writerOutput,
      artistOutput,
      ...summary
    } = run;
    const missing = [
      ["run slug", summary.slug],
      ["story", summary.story],
      ["researcher output", researcherOutput],
      ["director output", directorOutput],
      ["writer output", writerOutput],
      ["artist output", artistOutput],
    ].filter(([, value]) => value === null).map(([label]) => label);
    return {
      ...summary,
      source: researcherSource(researcherOutput),
      replayable: missing.length === 0,
      missing,
    };
    }) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load voyages" }, { status: 500 });
  }
}
