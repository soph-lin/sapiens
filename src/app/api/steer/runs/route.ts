import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { AGENT_CONFIG, ORCHESTRATOR_CONFIG } from "@/lib/orchestrator/config";
import type { Prisma } from "@/generated/prisma/client";

export const runtime = "nodejs";

function modelConfig() {
  return {
    agents: Object.fromEntries(Object.entries(AGENT_CONFIG).map(([agent, config]) => [agent, config])),
    maxOutputTokens: ORCHESTRATOR_CONFIG.maxOutputTokens,
    maxToolRounds: ORCHESTRATOR_CONFIG.maxToolRounds,
    maxTries: ORCHESTRATOR_CONFIG.maxTries,
  } as Prisma.InputJsonValue;
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { steering?: unknown; storyConfig?: unknown };
    const run = await prisma.storyGenRun.create({
      data: {
        slug: randomUUID().replaceAll("-", ""),
        status: "ongoing",
        progress: [] as Prisma.InputJsonValue,
        steering: body.steering === undefined ? undefined : body.steering as Prisma.InputJsonValue,
        storyConfig: body.storyConfig === undefined ? undefined : body.storyConfig as Prisma.InputJsonValue,
        modelConfig: modelConfig(),
      },
      select: { slug: true },
    });
    return NextResponse.json(run);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not create run" }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json() as {
      slug?: string;
      progress?: unknown[];
      usage?: unknown;
      error?: string | null;
      status?: "ongoing" | "fail" | "succeed";
      outputs?: Record<string, unknown>;
    };
    if (!body.slug) throw new Error("run slug is required");
    const outputFields = ["researcher", "director", "writer", "artist"] as const;
    const data: Prisma.StoryGenRunUpdateInput = {
      progress: body.progress === undefined ? undefined : body.progress as Prisma.InputJsonValue,
      usage: body.usage === undefined ? undefined : body.usage as Prisma.InputJsonValue,
      error: body.error === undefined ? undefined : body.error,
      status: body.status ?? (body.error ? "fail" : undefined),
      finishedAt: body.error ? new Date() : undefined,
    };
    for (const agent of outputFields) {
      const output = body.outputs?.[agent];
      if (output !== undefined) data[`${agent}Output` as keyof Prisma.StoryGenRunUpdateInput] = { set: output as Prisma.InputJsonValue } as never;
    }
    const run = await prisma.storyGenRun.update({ where: { slug: body.slug }, data, select: { slug: true } });
    return NextResponse.json(run);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not update run" }, { status: 400 });
  }
}
