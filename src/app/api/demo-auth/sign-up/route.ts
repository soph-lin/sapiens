import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import {
  DEMO_SESSION_COOKIE,
  DEMO_SESSION_COOKIE_OPTIONS,
  type DemoUser,
} from "@/lib/demo-auth";
import {
  generateClassroomCode,
  isValidUsername,
  normalizeClassroomCode,
  normalizeUsername,
} from "@/lib/learning/classroom-code";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type SignUpBody = {
  displayName?: unknown;
  username?: unknown;
  role?: unknown;
  classroomCode?: unknown;
};

class SignUpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "SignUpError";
  }
}

function textField(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new SignUpError(400, "INVALID_REQUEST", `${label} is required.`);
  }
  return value.trim();
}

function parseBody(body: unknown): SignUpBody {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new SignUpError(400, "INVALID_REQUEST", "Request body must be a JSON object.");
  }
  return body as SignUpBody;
}

async function allocateClassroomCode(
  tx: Prisma.TransactionClient = prisma,
): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = generateClassroomCode();
    const existing = await tx.classroom.findUnique({
      where: { code },
      select: { id: true },
    });
    if (!existing) return code;
  }
  throw new SignUpError(500, "CODE_GENERATION_FAILED", "Could not allocate a ship code.");
}

export async function POST(request: Request) {
  try {
    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      throw new SignUpError(400, "INVALID_REQUEST", "A JSON body is required.");
    }

    const body = parseBody(raw);
    const displayName = textField(body.displayName, "Name");
    const username = normalizeUsername(textField(body.username, "Username"));
    const role = body.role;

    if (role !== "teacher" && role !== "student") {
      throw new SignUpError(400, "INVALID_ROLE", "Role must be teacher or student.");
    }
    if (!isValidUsername(username)) {
      throw new SignUpError(
        400,
        "INVALID_USERNAME",
        "Username must be 2–32 characters: letters, numbers, _ or -.",
      );
    }

    const existing = await prisma.user.findUnique({
      where: { username },
      select: { id: true },
    });
    if (existing) {
      throw new SignUpError(409, "USERNAME_TAKEN", "That callsign is already taken.");
    }

    const user: DemoUser = await prisma.$transaction(async (tx) => {
      if (role === "teacher") {
        const code = await allocateClassroomCode(tx);
        const created = await tx.user.create({
          data: {
            username,
            displayName,
            role: "teacher",
          },
          select: { id: true, username: true, displayName: true, role: true },
        });
        await tx.classroom.create({
          data: {
            name: `${displayName}'s ship`,
            code,
            teacherId: created.id,
            memberships: { create: [{ userId: created.id }] },
          },
        });
        return created;
      }

      const classroomCode = normalizeClassroomCode(
        textField(body.classroomCode, "Classroom code"),
      );
      if (classroomCode.length < 3) {
        throw new SignUpError(400, "INVALID_CODE", "Enter a valid ship code.");
      }

      const classroom = await tx.classroom.findUnique({
        where: { code: classroomCode },
        select: { id: true },
      });
      if (!classroom) {
        throw new SignUpError(404, "UNKNOWN_SHIP", "No ship found with that code.");
      }

      return tx.user.create({
        data: {
          username,
          displayName,
          role: "student",
          memberships: { create: [{ classroomId: classroom.id }] },
        },
        select: { id: true, username: true, displayName: true, role: true },
      });
    });

    const response = NextResponse.json({ authenticated: true, user }, { status: 201 });
    response.cookies.set(DEMO_SESSION_COOKIE, user.username, DEMO_SESSION_COOKIE_OPTIONS);
    return response;
  } catch (error) {
    if (error instanceof SignUpError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: error.status },
      );
    }
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        { error: { code: "USERNAME_TAKEN", message: "That callsign is already taken." } },
        { status: 409 },
      );
    }
    console.error(error);
    return NextResponse.json(
      { error: { code: "SIGN_UP_FAILED", message: "Could not create account." } },
      { status: 500 },
    );
  }
}
