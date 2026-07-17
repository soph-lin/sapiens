import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { errorResponse, jsonInput, parseJsonBody, requireDemoUser, requireRole } from "@/lib/learning/api";
import { normalizeFlourishConfig, validateFurtherReading, validateGroundingSources, validateReportText } from "@/lib/orchestrator/agent/flourish";

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
      topic: true,
      modelConfig: true,
      storyConfig: true,
      progress: true,
      usage: true,
      error: true,
      researcherOutput: true,
      curatorOutput: true,
      directorOutput: true,
      writerOutput: true,
      artistOutput: true,
      startedAt: true,
      finishedAt: true,
      story: { select: { slug: true, topic: true, report: true } },
    },
  });

  if (!run) {
    return NextResponse.json({ error: "Generation run not found" }, { status: 404 });
  }
  return NextResponse.json({ run });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const user = await requireDemoUser(request);
    requireRole(user, "teacher");
    const { slug } = await params;
    const body = parseJsonBody<{ report?: unknown }>(await request.json());
    if (!body.report || typeof body.report !== "object" || Array.isArray(body.report)) throw new Error("report must be an object");
    const report = body.report as Record<string, unknown>;
    const reportText = validateReportText(report.reportText);
    const story = await prisma.story.findUnique({ where: { slug }, include: { genRun: { select: { storyConfig: true } } } });
    if (!story) return NextResponse.json({ error: "Voyage not found" }, { status: 404 });
    const config = normalizeFlourishConfig(story.genRun?.storyConfig);
    const sources = validateGroundingSources(report.sources, config, "report.sources");
    const validated = {
      reportText,
      sources,
      furtherReading: validateFurtherReading(report.furtherReading, config, sources.map((source) => source.url)),
    };
    const updated = await prisma.story.update({ where: { id: story.id }, data: { report: jsonInput(validated, "report") }, select: { slug: true, report: true } });
    return NextResponse.json({ voyage: updated });
  } catch (error) {
    return errorResponse(error, "Could not update voyage report.");
  }
}
