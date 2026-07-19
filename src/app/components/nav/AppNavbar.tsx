"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { LogOut } from "lucide-react";
import { useUser } from "@/app/components/user/UserProvider";
import type { DemoUser } from "@/lib/demo-auth";

export type AppNavbarTheme = "space" | "light";

const NAV_LINKS = [
  { href: "/nexus", label: "Nexus", match: (path: string) => path.startsWith("/nexus") },
  { href: "/home", label: "Home", match: (path: string) => path.startsWith("/home") },
] as const;

function userInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

function roleLabel(role: "teacher" | "student"): "Captain" | "Cadet" {
  return role === "teacher" ? "Captain" : "Cadet";
}

function Avatar({
  initials,
  theme,
  className = "",
}: {
  initials: string;
  theme: AppNavbarTheme;
  className?: string;
}) {
  if (theme === "light") {
    return (
      <span
        className={`grid size-9 shrink-0 place-items-center rounded-full border border-neutral-200 bg-neutral-100 font-space text-[9px] font-bold tracking-[-0.05em] text-neutral-800 ${className}`}
      >
        {initials}
      </span>
    );
  }

  return (
    <span
      className={`grid size-9 shrink-0 place-items-center rounded-full border border-[#071014] bg-cyan-200 font-space text-[9px] font-bold tracking-[-0.05em] text-[#071014] ${className}`}
    >
      {initials}
    </span>
  );
}

function SignedInControl({
  user,
  theme,
  onSignOut,
}: {
  user: DemoUser;
  theme: AppNavbarTheme;
  onSignOut: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const isLight = theme === "light";

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label="Account menu"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className={`rounded-full transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 ${isLight ? "focus-visible:ring-neutral-400" : "focus-visible:ring-cyan-200/70"}`}
      >
        <Avatar initials={userInitials(user.displayName)} theme={theme} />
      </button>
      {open ? (
        <div
          role="menu"
          aria-label="Account"
          className={`absolute right-0 top-[calc(100%+0.5rem)] z-50 min-w-[11rem] overflow-hidden rounded-xl border py-1 shadow-[0_16px_48px_rgba(0,0,0,0.2)] backdrop-blur-xl ${
            isLight
              ? "border-neutral-200 bg-white/95"
              : "border-white/10 bg-[#0a171d]/95 shadow-[0_16px_48px_rgba(0,0,0,0.45)]"
          }`}
        >
          <div
            className={`border-b px-3 py-2.5 ${isLight ? "border-neutral-100" : "border-white/10"}`}
          >
            <p
              className={`truncate text-sm ${isLight ? "text-neutral-900" : "text-white"}`}
            >
              {user.displayName}
            </p>
            <p
              className={`mt-0.5 font-space text-[9px] uppercase tracking-[0.14em] ${isLight ? "text-neutral-400" : "text-white/35"}`}
            >
              {roleLabel(user.role)}
            </p>
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onSignOut();
            }}
            className={`flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm transition focus-visible:outline-none ${
              isLight
                ? "text-neutral-600 hover:bg-neutral-50 hover:text-neutral-950 focus-visible:bg-neutral-50 focus-visible:text-neutral-950"
                : "text-white/65 hover:bg-white/[0.06] hover:text-white focus-visible:bg-white/[0.06] focus-visible:text-white"
            }`}
          >
            <LogOut size={14} />
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}

export default function AppNavbar({
  theme = "space",
  onSignOut,
}: {
  theme?: AppNavbarTheme;
  /** When set, called instead of the default sign-out (e.g. Nexus cleanup). */
  onSignOut?: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, setUser } = useUser();
  const isLight = theme === "light";

  const handleSignOut = () => {
    if (onSignOut) {
      onSignOut();
      return;
    }
    void fetch("/api/demo-auth/sign-out", { method: "POST" }).catch(() => {});
    setUser(null);
    router.replace("/roll-call?view=returning");
  };

  return (
    <header
      className={`sticky top-0 z-50 flex h-14 shrink-0 items-center justify-between border-b px-4 sm:px-6 ${
        isLight
          ? "border-neutral-200 bg-white text-neutral-900"
          : "border-white/10 bg-[#071014] text-[#f4f1ea]"
      }`}
    >
      <nav aria-label="Primary" className="flex items-center gap-1 sm:gap-2">
        {NAV_LINKS.map(({ href, label, match }) => {
          const active = match(pathname);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`rounded-lg px-2.5 py-1.5 font-space text-[10px] uppercase tracking-[0.18em] transition focus-visible:outline-none focus-visible:ring-2 sm:px-3 ${
                isLight
                  ? active
                    ? "bg-neutral-100 text-neutral-950"
                    : "text-neutral-500 hover:bg-neutral-50 hover:text-neutral-900 focus-visible:ring-neutral-400"
                  : active
                    ? "bg-cyan-200/10 text-cyan-100"
                    : "text-white/45 hover:bg-white/[0.05] hover:text-white/85 focus-visible:ring-cyan-200/70"
              }`}
            >
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="flex items-center">
        {user ? (
          <SignedInControl
            user={user}
            theme={theme}
            onSignOut={handleSignOut}
          />
        ) : (
          <Link
            href="/roll-call?view=returning"
            className={`rounded-full font-space text-[9px] uppercase tracking-[0.16em] transition focus-visible:outline-none focus-visible:ring-2 ${
              isLight
                ? "border border-neutral-200 px-3 py-2 text-neutral-600 hover:bg-neutral-50 focus-visible:ring-neutral-400"
                : "border border-white/15 px-3 py-2 text-white/55 hover:border-white/25 hover:text-white focus-visible:ring-cyan-200/70"
            }`}
          >
            Sign in
          </Link>
        )}
      </div>
    </header>
  );
}
