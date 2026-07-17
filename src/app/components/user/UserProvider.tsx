"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import type { DemoUser } from "@/lib/demo-auth";

type UserContextValue = {
  user: DemoUser | null;
  setUser: (user: DemoUser | null) => void;
  refreshUser: () => Promise<DemoUser | null>;
};

const UserContext = createContext<UserContextValue | null>(null);

export function UserProvider({
  initialUser,
  children,
}: {
  initialUser: DemoUser | null;
  children: React.ReactNode;
}) {
  const [user, setUser] = useState<DemoUser | null>(initialUser);

  const refreshUser = useCallback(async () => {
    const response = await fetch("/api/demo-auth/session", { cache: "no-store" });
    if (!response.ok) {
      setUser(null);
      return null;
    }

    const payload = (await response.json()) as { user?: DemoUser | null };
    const nextUser = payload.user ?? null;
    setUser(nextUser);
    return nextUser;
  }, []);

  const value = useMemo(
    () => ({ user, setUser, refreshUser }),
    [refreshUser, user],
  );

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

export function useUser() {
  const context = useContext(UserContext);
  if (!context) throw new Error("useUser must be used within UserProvider.");
  return context;
}
