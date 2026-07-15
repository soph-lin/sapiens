import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const run = await prisma.storyGenRun.findFirst({
    where: {
      slug,
    },
    select: {
      slug: true,
      status: true,
      steering: true,
      modelConfig: true,
      storyConfig: true,
      progress: true,
      usage: true,
      error: true,
      researcherOutput: true,
      directorOutput: true,
      writerOutput: true,
      artistOutput: true,
      startedAt: true,
      finishedAt: true,
      story: { select: { slug: true, topic: true } },
    },
  });

  if (!run) {
    return NextResponse.json({ error: "Generation run not found" }, { status: 404 });
  }
  return NextResponse.json({ run });
}
