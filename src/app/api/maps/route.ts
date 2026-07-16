import { NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requiredMapName, validateMapData } from "@/lib/game/map/validation";

export const runtime = "nodejs";

export async function GET() {
  try {
    const maps = await prisma.map.findMany({
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        name: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ maps });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load maps." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { name?: unknown; data?: unknown };
    const name = requiredMapName(body.name);
    const data = validateMapData(body.data);
    const map = await prisma.map.create({
      data: {
        name,
        data: data as Prisma.InputJsonValue,
      },
      select: {
        id: true,
        name: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json(map, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not upload map." },
      { status: 400 },
    );
  }
}
