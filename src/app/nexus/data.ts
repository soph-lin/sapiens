import { TOXICITY_BLOCKED } from "@/lib/learning/starstream-constants";

export type PublishState = "draft" | "published";
export type AssignmentState = "not-started" | "in-progress" | "complete";
export type SourceMode = "free" | "restricted";

export type VoyageCollectible = {
  name: string;
  description: string;
  assetUrl: string;
};

export type Voyage = {
  id: string;
  slug: string;
  title: string;
  topic: string;
  period: string;
  scene: string;
  lessonPlan: string;
  sources: string[];
  status: PublishState;
  publishedAt?: string;
  report?: { reportText: string; sources: string[]; furtherReading: string[] };
  /** Username of the student who owns a solo voyage. */
  ownerId?: string;
  stream?: "classroom" | "solo";
  /** Whether the signed-in student has completed this voyage. */
  completed?: boolean;
  /** ISO timestamp from VoyageProgress when the student completed this voyage. */
  completedAt?: string;
  /** Collectible earned on completion (student snapshot only). */
  collectible?: VoyageCollectible | null;
  /** Cadets in the classroom who have completed this voyage. */
  cadetsCompleted?: number;
};

export type Journey = {
  id: string;
  title: string;
  description: string;
  voyageIds: string[];
  status: PublishState;
  /** Username of the assignee when scoped to a student view. */
  assignedTo: string;
};

export type Assignment = {
  id: string;
  assignmentId?: string;
  kind: "voyage" | "journey";
  voyageId?: string;
  journeyId?: string;
  title?: string;
  status?: PublishState;
  lessonPlan?: string;
  sources?: string[];
  assignedTo: string;
  state: AssignmentState;
  progress: number;
  due: string;
};

export type FieldNote = {
  id: string;
  voyageId: string;
  /** Author username from the User table. */
  authorId: string;
  authorName: string;
  body: string;
  status: PublishState;
  createdAt: string;
  sources?: string[];
  authorType?: "user" | "bot";
};

export type StarstreamAttachment = {
  url: string;
  kind?: "link" | "video";
  label?: string;
};

export type StarstreamLogPost = {
  id: string;
  voyageId: string;
  /** Null for solo / home visitor shares — those belong under the Solo tab only. */
  assignmentId: string | null;
  parentId: string | null;
  allowReplies: boolean;
  type: "post" | "visitorNote";
  /** Author username from the User table. */
  authorId: string;
  authorName: string;
  authorType?: "user" | "bot";
  body: string;
  visitorNote?: {
    characterName: string;
    voyageTopic: string;
    fact: string;
    sources: string[];
    commentary?: string;
  };
  attachments: StarstreamAttachment[];
  createdAt: string;
  likeCount: number;
  likedByMe: boolean;
  replies: StarstreamLogPost[];
};

export type ClassroomSettings = {
  id: string;
  name: string;
  sourceMode: SourceMode;
  approvedDomains: string[];
  /** Student members in the classroom. */
  cadetCount: number;
};

/** Classroom roster entry for Crew (Captain + Cadets). */
export type CrewMember = {
  /** Username from the User table. */
  id: string;
  displayName: string;
  role: "teacher" | "student";
};

export type CadetLastPost = {
  id: string;
  body: string;
  createdAt: string;
  voyageTitle?: string;
};

/** Teacher Cadets tab: assignment progress + latest Starstream post. */
export type CadetProgress = {
  /** Username from the User table. */
  id: string;
  displayName: string;
  assignmentsComplete: number;
  assignmentsTotal: number;
  /** Overall completion across published classroom voyage assignments (0–100). */
  progress: number;
  lastPost: CadetLastPost | null;
};

export type NexusSnapshot = {
  voyages: Voyage[];
  journeys: Journey[];
  assignments: Assignment[];
  fieldNotes: FieldNote[];
  starstreamLogs: StarstreamLogPost[];
  classroom: ClassroomSettings | null;
  crew: CrewMember[];
  /** Teacher-only cadet progress rows; empty for students. */
  cadets: CadetProgress[];
};

/** Empty workspace while the domain snapshot loads from the API. */
export const EMPTY_SNAPSHOT: NexusSnapshot = {
  voyages: [],
  journeys: [],
  assignments: [],
  fieldNotes: [],
  starstreamLogs: [],
  classroom: null,
  crew: [],
  cadets: [],
};

export function cloneSnapshot(snapshot: NexusSnapshot): NexusSnapshot {
  return JSON.parse(JSON.stringify(snapshot)) as NexusSnapshot;
}

function normalizeSnapshot(data: Partial<NexusSnapshot>): NexusSnapshot | null {
  if (
    !Array.isArray(data.voyages) ||
    !Array.isArray(data.journeys) ||
    !Array.isArray(data.assignments) ||
    !Array.isArray(data.fieldNotes)
  ) {
    return null;
  }
  return {
    voyages: data.voyages.map((voyage) => ({
      ...voyage,
      completedAt:
        typeof voyage.completedAt === "string" ? voyage.completedAt : undefined,
      collectible:
        voyage.collectible &&
        typeof voyage.collectible === "object" &&
        typeof voyage.collectible.name === "string" &&
        typeof voyage.collectible.description === "string" &&
        typeof voyage.collectible.assetUrl === "string"
          ? voyage.collectible
          : voyage.collectible === null
            ? null
            : undefined,
      cadetsCompleted:
        typeof voyage.cadetsCompleted === "number" ? voyage.cadetsCompleted : 0,
    })),
    journeys: data.journeys,
    assignments: data.assignments,
    fieldNotes: data.fieldNotes,
    starstreamLogs: Array.isArray(data.starstreamLogs)
      ? data.starstreamLogs.map((log) => ({
          ...log,
          assignmentId: typeof log.assignmentId === "string" ? log.assignmentId : null,
          replies: Array.isArray(log.replies)
            ? log.replies.map((reply) => ({
                ...reply,
                assignmentId:
                  typeof reply.assignmentId === "string" ? reply.assignmentId : null,
              }))
            : [],
        }))
      : [],
    classroom: data.classroom
      ? {
          ...data.classroom,
          cadetCount:
            typeof data.classroom.cadetCount === "number"
              ? data.classroom.cadetCount
              : 0,
        }
      : null,
    crew: Array.isArray(data.crew) ? data.crew : [],
    cadets: Array.isArray(data.cadets) ? data.cadets : [],
  };
}

/** Load the signed-in user's Nexus domain snapshot from the database. */
export async function requestDomainSnapshot(): Promise<NexusSnapshot | null> {
  try {
    const response = await fetch("/api/nexus", { cache: "no-store" });
    if (!response.ok) return null;
    const data = (await response.json()) as Partial<NexusSnapshot>;
    return normalizeSnapshot(data);
  } catch {
    return null;
  }
}

/** Persist a Nexus mutation; the session cookie identifies the actor. */
export async function sendDomainMutation(
  action: string,
  payload: unknown,
): Promise<NexusSnapshot | null> {
  try {
    const response = await fetch("/api/nexus", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, payload }),
    });
    const data = (await response.json().catch(() => null)) as
      | (Partial<NexusSnapshot> & { error?: string })
      | null;
    if (!response.ok) {
      if (
        data?.error === TOXICITY_BLOCKED ||
        data?.error === "replies_disabled"
      ) {
        throw new Error(data.error);
      }
      return null;
    }
    return normalizeSnapshot(data ?? {});
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message === TOXICITY_BLOCKED || error.message === "replies_disabled")
    ) {
      throw error;
    }
    return null;
  }
}

export function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function assignmentKeyForVoyage(
  snapshot: NexusSnapshot,
  voyageId: string,
): string | null {
  const matches = snapshot.assignments.filter(
    (assignment) =>
      assignment.kind === "voyage" && assignment.voyageId === voyageId,
  );
  const assignment =
    matches.find((item) => !item.journeyId) ?? matches.at(0) ?? null;
  if (!assignment) return null;
  return assignment.assignmentId ?? assignment.id;
}

/** Prefer classroom membership count; fall back to unique assignees. */
export function classroomCadetTotal(snapshot: NexusSnapshot): number {
  const counted = snapshot.classroom?.cadetCount;
  if (typeof counted === "number" && counted > 0) return counted;
  const assignees = new Set(
    snapshot.assignments.map((assignment) => assignment.assignedTo),
  );
  if (assignees.size > 0) return assignees.size;
  return typeof counted === "number" ? counted : 0;
}

export function userInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

export function roleLabel(role: "teacher" | "student"): "Captain" | "Cadet" {
  return role === "teacher" ? "Captain" : "Cadet";
}
