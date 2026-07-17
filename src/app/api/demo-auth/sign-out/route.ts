import { NextResponse } from "next/server";
import {
  DEMO_SESSION_COOKIE,
  DEMO_SESSION_COOKIE_OPTIONS,
} from "@/lib/demo-auth";

export const runtime = "nodejs";

export async function POST() {
  const response = NextResponse.json({ authenticated: false, user: null });
  response.cookies.set(DEMO_SESSION_COOKIE, "", {
    ...DEMO_SESSION_COOKIE_OPTIONS,
    maxAge: 0,
  });
  return response;
}
