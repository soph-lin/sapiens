import { NextResponse } from "next/server";
import {
  DEMO_SESSION_COOKIE,
  DEMO_SESSION_COOKIE_OPTIONS,
  findDemoUserByUsername,
} from "@/lib/demo-auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: "INVALID_REQUEST", message: "A JSON username is required." } },
      { status: 400 },
    );
  }

  const username =
    body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>).username
      : undefined;
  const user = await findDemoUserByUsername(username);
  if (!user) {
    return NextResponse.json(
      {
        error: {
          code: "INVALID_DEMO_USER",
          message: "Choose an existing user account.",
        },
      },
      { status: 400 },
    );
  }

  const response = NextResponse.json({ authenticated: true, user });
  response.cookies.set(DEMO_SESSION_COOKIE, user.username, DEMO_SESSION_COOKIE_OPTIONS);
  return response;
}
