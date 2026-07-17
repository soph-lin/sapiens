import { NextResponse } from "next/server";
import type { User, UserRole, Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { DemoAuthError, requireDemoUsername } from "@/lib/demo-auth";

export class ApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

export function errorResponse(error: unknown, fallback = "Request could not be completed.") {
  if (error instanceof ApiError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof DemoAuthError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  console.error(error);
  return NextResponse.json({ error: fallback }, { status: 500 });
}

export function requiredText(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new ApiError(400, `${label} is required.`);
  }
  return value.trim();
}

export function optionalText(value: unknown, label: string): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return requiredText(value, label);
}

export function jsonInput(value: unknown, label: string): Prisma.InputJsonValue {
  if (value === undefined || value === null) {
    throw new ApiError(400, `${label} must be a JSON value.`);
  }
  return value as Prisma.InputJsonValue;
}

export function publicationStatus(value: unknown, label = "status") {
  if (value === undefined) return undefined;
  if (value !== "draft" && value !== "published" && value !== "archived") {
    throw new ApiError(400, `${label} must be draft, published, or archived.`);
  }
  return value as "draft" | "published" | "archived";
}

export async function requireDemoUser(request: Request): Promise<User> {
  const username = requireDemoUsername(request);
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user) {
    throw new ApiError(503, "Demo users are not initialized. Run the Prisma migration first.");
  }
  return user;
}

export function requireRole(user: Pick<User, "role">, role: UserRole) {
  if (user.role !== role) {
    throw new ApiError(403, `Only ${role}s can perform this action.`);
  }
}

export function parseJsonBody<T>(body: unknown): T {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ApiError(400, "Request body must be a JSON object.");
  }
  return body as T;
}

export function isPrismaNotFound(error: unknown) {
  return error instanceof Error && error.message.includes("Record to update not found");
}
