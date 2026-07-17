import { cookies } from "next/headers";
import type { User, UserRole } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

export const DEMO_SESSION_COOKIE = "sapiens_demo_session";

/** Session payload shaped from the `User` table (no separate mock roster). */
export type DemoUser = Pick<User, "id" | "username" | "displayName" | "role">;

export type DemoAuthErrorCode = "UNAUTHENTICATED" | "FORBIDDEN";

export class DemoAuthError extends Error {
  readonly code: DemoAuthErrorCode;
  readonly status: 401 | 403;

  constructor(code: DemoAuthErrorCode, message: string) {
    super(message);
    this.name = "DemoAuthError";
    this.code = code;
    this.status = code === "UNAUTHENTICATED" ? 401 : 403;
  }
}

export const DEMO_SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 24 * 30,
};

const demoUserSelect = {
  id: true,
  username: true,
  displayName: true,
  role: true,
} as const;

function cookieValue(cookieHeader: string, name: string): string | undefined {
  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1 || part.slice(0, separator).trim() !== name) continue;

    const value = part.slice(separator + 1).trim();
    try {
      return decodeURIComponent(value);
    } catch {
      return undefined;
    }
  }

  return undefined;
}

export function getDemoUsernameFromRequest(request: Request): string | null {
  const header = request.headers.get("cookie");
  const username = header
    ? cookieValue(header, DEMO_SESSION_COOKIE)
    : undefined;
  return username?.trim() || null;
}

/** Look up a demo session user from the `User` table. */
export async function findDemoUserByUsername(
  username: unknown,
): Promise<DemoUser | null> {
  if (typeof username !== "string" || !username.trim()) return null;
  return prisma.user.findUnique({
    where: { username: username.trim() },
    select: demoUserSelect,
  });
}

/** Resolve the demo user from a request cookie via the `User` table. */
export async function getDemoUserFromRequest(
  request: Request,
): Promise<DemoUser | null> {
  return findDemoUserByUsername(getDemoUsernameFromRequest(request));
}

/** Resolve the demo user in a server component, server action, or route helper. */
export async function getCurrentDemoUser(): Promise<DemoUser | null> {
  const cookieStore = await cookies();
  return findDemoUserByUsername(
    cookieStore.get(DEMO_SESSION_COOKIE)?.value,
  );
}

/** Require any signed-in demo username in a route handler. This is demo-only, not real security. */
export function requireDemoUsername(request: Request): string {
  const username = getDemoUsernameFromRequest(request);
  if (!username) {
    throw new DemoAuthError(
      "UNAUTHENTICATED",
      "Sign in to use this demo.",
    );
  }
  return username;
}

/** Require any signed-in demo user (DB-backed) in a route handler. */
export async function requireDemoUser(request: Request): Promise<DemoUser> {
  const user = await getDemoUserFromRequest(request);
  if (!user) {
    throw new DemoAuthError(
      "UNAUTHENTICATED",
      "Sign in to use this demo.",
    );
  }
  return user;
}

/** Require the requested demo role in a route handler. This is demo-only, not real security. */
export async function requireDemoRole(
  request: Request,
  role: UserRole,
): Promise<DemoUser> {
  const user = await requireDemoUser(request);
  if (user.role !== role) {
    throw new DemoAuthError(
      "FORBIDDEN",
      `This demo action requires the ${role} view.`,
    );
  }
  return user;
}

/** Teachers first, then students; stable by display name within role. */
export function sortUsersTeachersFirst<T extends { role: UserRole; displayName: string }>(
  users: T[],
): T[] {
  return [...users].sort((a, b) => {
    if (a.role !== b.role) return a.role === "teacher" ? -1 : 1;
    return a.displayName.localeCompare(b.displayName);
  });
}
