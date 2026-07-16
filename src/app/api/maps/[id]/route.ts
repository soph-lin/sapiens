import { NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requiredMapName, validateMapData } from "@/lib/game/map/validation";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const map = await prisma.map.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      data: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!map) {
    return NextResponse.json({ error: "Map not found." }, { status: 404 });
  }

  return NextResponse.json(map);
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const body = (await request.json()) as { name?: unknown; data?: unknown };
    const name = requiredMapName(body.name);
    const data = validateMapData(body.data);
    const map = await prisma.map.update({
      where: { id },
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

    return NextResponse.json(map);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save map.";
    return NextResponse.json(
      { error: message },
      { status: message === "Map not found." ? 404 : 400 },
    );
  }
}
