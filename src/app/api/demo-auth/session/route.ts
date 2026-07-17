import { NextResponse } from "next/server";
import { getCurrentDemoUser } from "@/lib/demo-auth";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentDemoUser();
  if (!user) {
    return NextResponse.json(
      {
        authenticated: false,
        user: null,
        error: {
          code: "UNAUTHENTICATED",
          message: "No valid demo session. Sign in from /roll-call.",
        },
      },
      { status: 401 },
    );
  }

  return NextResponse.json({ authenticated: true, user });
}
