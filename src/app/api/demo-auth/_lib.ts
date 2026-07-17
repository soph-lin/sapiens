import { NextResponse } from "next/server";
import { DemoAuthError } from "@/lib/demo-auth";

export function demoAuthErrorResponse(error: unknown) {
  if (error instanceof DemoAuthError) {
    return NextResponse.json(
      {
        authenticated: error.code !== "UNAUTHENTICATED",
        user: null,
        error: { code: error.code, message: error.message },
      },
      { status: error.status },
    );
  }

  console.error(error);
  return NextResponse.json({ error: "Demo auth request failed." }, { status: 500 });
}
