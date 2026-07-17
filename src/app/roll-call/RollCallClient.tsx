"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { BookOpen, GraduationCap, X } from "lucide-react";
import type { UserRole } from "@/generated/prisma/client";
import type { DemoUser } from "@/lib/demo-auth";
import { useUser } from "@/app/components/user/UserProvider";
import { SparklingStars } from "@/app/components/effects";

type RollCallView = "new" | "returning";
type SignUpRole = "teacher" | "student";

const VIEWS: { id: RollCallView; label: string }[] = [
  { id: "new", label: "New player" },
  { id: "returning", label: "Returning player" },
];

const SIGN_UP_ROLES: { id: SignUpRole; label: string }[] = [
  { id: "student", label: "Student" },
  { id: "teacher", label: "Teacher" },
];

const ROLE_MISSION: Record<SignUpRole, string> = {
  teacher:
    "Your mission is to guide your crew through uncharted territory and plot exciting voyages.",
  student:
    "Your mission is to venture forth through unfamiliar worlds and log your discoveries to the starstream.",
};

const promptLabelClassName =
  "w-[9.25rem] shrink-0 font-space text-[11px] uppercase tracking-[0.22em] text-white/45";

const inputClassName =
  "w-full border-0 border-b border-white/15 bg-transparent px-0 py-2.5 font-space text-[11px] tracking-[0.22em] text-white outline-none placeholder:uppercase placeholder:text-white/25 transition-[border-color] duration-200 focus:border-white/45";

const tabClassName = (selected: boolean) =>
  `relative pb-2 font-space text-[11px] uppercase tracking-[0.22em] outline-none transition-colors duration-200 focus-visible:text-white ${selected ? "text-white" : "text-white/40 hover:text-white/70"}`;

const formGridClassName =
  "mx-auto grid w-full max-w-sm grid-cols-[9.25rem_minmax(0,1fr)] items-baseline gap-x-4 gap-y-8";

function PromptField({
  labelId,
  prompt,
  fieldLabel,
  name,
  placeholder,
  autoComplete,
}: {
  labelId: string;
  prompt: string;
  fieldLabel: string;
  name: string;
  placeholder: string;
  autoComplete?: string;
}) {
  return (
    <div className="contents">
      <span id={labelId} className={promptLabelClassName}>
        {prompt}
      </span>
      <label className="min-w-0">
        <span className="sr-only">{fieldLabel}</span>
        <input
          name={name}
          type="text"
          autoComplete={autoComplete}
          placeholder={placeholder}
          aria-labelledby={labelId}
          className={inputClassName}
        />
      </label>
    </div>
  );
}
function roleLabel(role: UserRole) {
  return role === "teacher" ? "Teacher" : "Student";
}

function RoleIcon({ role }: { role: UserRole }) {
  const Icon = role === "teacher" ? GraduationCap : BookOpen;
  return (
    <span
      className="group/role relative shrink-0 text-white/40"
      aria-label={roleLabel(role)}
      title={roleLabel(role)}
    >
      <Icon size={14} strokeWidth={1.5} aria-hidden />
      <span className="pointer-events-none absolute left-1/2 bottom-[calc(100%+0.35rem)] -translate-x-1/2 whitespace-nowrap rounded-md border border-cyan-100/15 bg-slate-950/95 px-2 py-1 font-space text-[9px] uppercase tracking-[0.14em] text-cyan-100/80 opacity-0 shadow-[0_0_20px_rgba(103,232,249,0.12)] transition-opacity group-hover/role:opacity-100 group-focus-within/role:opacity-100">
        {roleLabel(role)}
      </span>
    </span>
  );
}

function AvatarPlaceholder({ name }: { name: string }) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  return (
    <span
      aria-hidden
      className="grid aspect-square w-full place-items-center rounded-full bg-white/[0.06] font-space text-[clamp(2rem,7vw,3.5rem)] uppercase tracking-[0.08em] text-white/55 transition-[background-color,color] duration-200 ease-out group-hover:bg-white/[0.1] group-hover:text-white/80 group-focus-visible:bg-white/[0.12] group-focus-visible:text-white"
    >
      {initial}
    </span>
  );
}

function NewPlayer() {
  const router = useRouter();
  const { setUser } = useUser();
  const [role, setRole] = useState<SignUpRole>("student");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const roleTabRefs = useRef<Record<SignUpRole, HTMLButtonElement | null>>({
    teacher: null,
    student: null,
  });

  function handleRoleTabKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const next: SignUpRole = role === "student" ? "teacher" : "student";
    setRole(next);
    roleTabRefs.current[next]?.focus();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    const form = event.currentTarget;
    const data = new FormData(form);
    const displayName = String(data.get("displayName") ?? "").trim();
    const username = String(data.get("username") ?? "").trim();
    const classroomCode = String(data.get("classroomCode") ?? "").trim();

    if (!displayName) {
      setError("Name is required.");
      return;
    }
    if (!username) {
      setError("Callsign is required.");
      return;
    }
    if (role === "student" && !classroomCode) {
      setError("Ship code is required.");
      return;
    }

    setError(null);
    setPending(true);

    try {
      const response = await fetch("/api/demo-auth/sign-up", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName,
          username,
          role,
          classroomCode: role === "student" ? classroomCode : undefined,
        }),
      });
      const payload = (await response.json()) as {
        user?: DemoUser;
        error?: { message?: string };
      };

      if (!response.ok || !payload.user) {
        setError(payload.error?.message ?? "Could not create account.");
        setPending(false);
        return;
      }

      setUser(payload.user);
      router.push("/nexus");
      router.refresh();
    } catch {
      setError("Could not create account. Try again.");
      setPending(false);
    }
  }

  return (
    <form className={formGridClassName} noValidate onSubmit={(event) => void handleSubmit(event)}>
      <PromptField
        labelId="roll-call-name-label"
        prompt="Call me…"
        fieldLabel="Name"
        name="displayName"
        placeholder="Name"
        autoComplete="nickname"
      />

      <PromptField
        labelId="roll-call-callsign-label"
        prompt="Callsign…"
        fieldLabel="Username"
        name="username"
        placeholder="Username"
        autoComplete="username"
      />

      <div className="col-span-2 grid grid-cols-subgrid gap-y-4">
        <span id="roll-call-role-label" className={promptLabelClassName}>
          I am a…
        </span>
        <div
          role="tablist"
          aria-labelledby="roll-call-role-label"
          className="flex items-baseline gap-6"
        >
          {SIGN_UP_ROLES.map((entry) => {
            const selected = role === entry.id;
            return (
              <button
                key={entry.id}
                ref={(node) => {
                  roleTabRefs.current[entry.id] = node;
                }}
                type="button"
                role="tab"
                id={`roll-call-role-tab-${entry.id}`}
                aria-selected={selected}
                aria-controls="roll-call-role-panel"
                tabIndex={selected ? 0 : -1}
                onClick={() => setRole(entry.id)}
                onKeyDown={handleRoleTabKeyDown}
                className={tabClassName(selected)}
              >
                {entry.label}
                <span
                  aria-hidden
                  className={`absolute inset-x-0 bottom-0 h-px origin-center bg-white transition-transform duration-200 ease-out ${selected ? "scale-x-100" : "scale-x-0"}`}
                />
              </button>
            );
          })}
        </div>

        <p className="col-start-2 font-space text-[11px] leading-relaxed tracking-[0.14em] text-white/50">
          {ROLE_MISSION[role]}
        </p>
      </div>
      <input type="hidden" name="role" value={role} />

      <div
        role="tabpanel"
        id="roll-call-role-panel"
        aria-labelledby={`roll-call-role-tab-${role}`}
        hidden={role !== "student"}
        className="contents"
      >
        {role === "student" ? (
          <PromptField
            labelId="roll-call-ship-label"
            prompt="Enter ship…"
            fieldLabel="Classroom code"
            name="classroomCode"
            placeholder="Code"
          />
        ) : null}
      </div>

      {error ? (
        <p
          role="alert"
          className="col-span-2 text-center font-space text-[11px] tracking-[0.14em] text-orange-200/90"
        >
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className={`col-span-2 mt-4 justify-self-center bg-transparent px-0 py-2 font-space text-[11px] uppercase tracking-[0.2em] outline-none transition-colors focus-visible:text-white ${pending ? "cursor-wait text-white/30" : "text-white/70 hover:text-white"}`}
      >
        {pending ? "Creating…" : "Create account"}
      </button>
    </form>
  );
}

function ReturningPlayer({ users }: { users: DemoUser[] }) {
  const router = useRouter();
  const { setUser } = useUser();
  const [pendingUsername, setPendingUsername] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function chooseUser(user: DemoUser) {
    if (pendingUsername) return;
    setError(null);
    setPendingUsername(user.username);

    try {
      const response = await fetch("/api/demo-auth/sign-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: user.username }),
      });
      const payload = (await response.json()) as {
        user?: DemoUser;
        error?: { message?: string };
      };

      if (!response.ok || !payload.user) {
        setError(payload.error?.message ?? "Could not sign in.");
        setPendingUsername(null);
        return;
      }

      setUser(payload.user);
      router.push("/nexus");
      router.refresh();
    } catch {
      setError("Could not sign in. Try again.");
      setPendingUsername(null);
    }
  }

  function handleProfileKeyDown(
    event: ReactKeyboardEvent<HTMLButtonElement>,
    user: DemoUser,
  ) {
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      void chooseUser(user);
    }
  }

  if (users.length === 0) {
    return (
      <p className="text-center font-space text-[11px] uppercase tracking-[0.22em] text-white/45">
        No users found. Seed the database first.
      </p>
    );
  }

  return (
    <div className="flex flex-col items-center">
      <ul
        className="flex w-full max-w-3xl flex-wrap items-end justify-center gap-x-10 gap-y-12 sm:gap-x-14"
        role="list"
      >
        {users.map((user) => {
          const busy = pendingUsername === user.username;
          const dimmed = pendingUsername !== null && !busy;
          return (
            <li key={user.id} className="w-[min(42vw,11rem)] sm:w-44">
              <button
                type="button"
                onClick={() => void chooseUser(user)}
                onKeyDown={(event) => handleProfileKeyDown(event, user)}
                disabled={pendingUsername !== null}
                aria-label={`${user.displayName}, ${roleLabel(user.role)}`}
                className={`group flex w-full flex-col items-center outline-none disabled:cursor-wait ${dimmed ? "opacity-35" : ""}`}
              >
                <AvatarPlaceholder name={user.displayName} />
                <span className="mt-4 flex items-center justify-center gap-1.5">
                  <span className="font-space text-[11px] uppercase tracking-[0.22em] text-white/80 transition-colors duration-200 group-hover:text-white group-focus-visible:text-white">
                    {busy ? "…" : user.displayName}
                  </span>
                  <RoleIcon role={user.role} />
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {error ? (
        <p role="alert" className="mt-8 font-space text-[11px] tracking-[0.14em] text-orange-200/90">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function RollCallClient({
  users,
  initialView,
}: {
  users: DemoUser[];
  initialView: RollCallView;
}) {
  const router = useRouter();
  const [view, setView] = useState<RollCallView>(initialView);
  const tabRefs = useRef<Record<RollCallView, HTMLButtonElement | null>>({
    new: null,
    returning: null,
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      router.push("/");
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [router]);

  function handleTabKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const next: RollCallView = view === "new" ? "returning" : "new";
    setView(next);
    tabRefs.current[next]?.focus();
  }

  return (
    <div className="relative min-h-dvh overflow-hidden bg-black font-space text-[#f4f1ea]">
      <SparklingStars />
      <Link
        href="/"
        aria-label="Close roll call"
        className="group absolute top-6 right-6 z-20 rounded-sm p-1 text-white/40 outline-none transition-colors hover:text-white focus-visible:text-white focus-visible:ring-1 focus-visible:ring-white/30"
      >
        <X size={18} strokeWidth={1.5} />
        <span className="pointer-events-none absolute right-0 bottom-[calc(100%+0.35rem)] whitespace-nowrap rounded-md border border-cyan-100/15 bg-slate-950/95 px-2 py-1 font-space text-[9px] uppercase tracking-[0.14em] text-cyan-100/80 opacity-0 shadow-[0_0_20px_rgba(103,232,249,0.12)] transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
          Close
        </span>
      </Link>

      <main className="relative z-10 flex min-h-dvh w-full flex-col items-center px-6 pt-20 pb-16">
        <div
          role="tablist"
          aria-label="Roll call"
          className="flex items-center gap-8"
        >
          {VIEWS.map((entry) => {
            const selected = view === entry.id;
            return (
              <button
                key={entry.id}
                ref={(node) => {
                  tabRefs.current[entry.id] = node;
                }}
                type="button"
                role="tab"
                id={`roll-call-tab-${entry.id}`}
                aria-selected={selected}
                aria-controls={`roll-call-panel-${entry.id}`}
                tabIndex={selected ? 0 : -1}
                onClick={() => setView(entry.id)}
                onKeyDown={handleTabKeyDown}
                className={tabClassName(selected)}
              >
                {entry.label}
                <span
                  aria-hidden
                  className={`absolute inset-x-0 bottom-0 h-px origin-center bg-white transition-transform duration-200 ease-out ${selected ? "scale-x-100" : "scale-x-0"}`}
                />
              </button>
            );
          })}
        </div>

        <div className="mt-16 flex w-full flex-1 flex-col justify-center">
          <div
            role="tabpanel"
            id="roll-call-panel-new"
            aria-labelledby="roll-call-tab-new"
            hidden={view !== "new"}
          >
            {view === "new" ? <NewPlayer /> : null}
          </div>
          <div
            role="tabpanel"
            id="roll-call-panel-returning"
            aria-labelledby="roll-call-tab-returning"
            hidden={view !== "returning"}
          >
            {view === "returning" ? <ReturningPlayer users={users} /> : null}
          </div>
        </div>
      </main>
    </div>
  );
}
