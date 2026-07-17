import { RollCallClient } from "./RollCallClient";
import { prisma } from "@/lib/prisma";
import { sortUsersTeachersFirst } from "@/lib/demo-auth";

type RollCallView = "new" | "returning";

function normalizeView(value: string | string[] | undefined): RollCallView {
  return value === "new" ? "new" : "returning";
}

export default async function RollCallPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string | string[] }>;
}) {
  const { view } = await searchParams;
  const users = sortUsersTeachersFirst(
    await prisma.user.findMany({
      select: {
        id: true,
        username: true,
        displayName: true,
        role: true,
      },
    }),
  );

  return <RollCallClient users={users} initialView={normalizeView(view)} />;
}
