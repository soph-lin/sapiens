import { NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { errorResponse, jsonInput, parseJsonBody, requireDemoUser, requiredText } from "@/lib/learning/api";
import { isTakeawayNoteContent, takeawayNoteBody } from "@/lib/learning/field-note-content";
import {
  starstreamAttachmentsView,
  starstreamLogBody,
  parseVisitorNoteContent,
  syncStarstreamLogFromFieldNote,
  toggleStarstreamLike,
} from "@/lib/learning/starstream";
import { sourcePolicyFromClassroom } from "@/lib/orchestrator/agent/flourish";
import type { StarstreamLogPost } from "@/app/nexus/data";

export const runtime = "nodejs";

type VoyageJson = { title?: string; scene?: string; period?: string; lessonPlan?: string; sources?: string[] };
type NexusBody = { action?: unknown; payload?: unknown };

type StarstreamLogRow = {
  id: string;
  storyId: string;
  assignmentId: string | null;
  parentId: string | null;
  allowReplies: boolean;
  type?: string;
  authorType: string;
  authorName: string | null;
  content: unknown;
  attachments: unknown;
  createdAt: Date;
  author: { username: string; displayName: string };
  _count: { likes: number };
  likes: { userId: string }[];
  replies?: StarstreamLogRow[];
};

function storyDetails(value: unknown, fallback: { title: string; scene: string; period: string; lessonPlan: string; sources: string[] }) {
  const json = value && typeof value === "object" && !Array.isArray(value) ? value as VoyageJson : {};
  const rawPeriod = typeof json.period === "string" ? json.period.trim() : "";
  const period =
    rawPeriod && !/^(unspecified(\s+period)?|unknown|n\/?a|none|not\s+specified|historical\s+era)$/i.test(rawPeriod)
      ? rawPeriod
      : fallback.period;
  return {
    title: json.title ?? fallback.title,
    scene: json.scene ?? fallback.scene,
    period,
    lessonPlan: json.lessonPlan ?? fallback.lessonPlan,
    sources: Array.isArray(json.sources) ? json.sources : fallback.sources,
  };
}

function reportView(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const report = value as Record<string, unknown>;
  if (typeof report.reportText !== "string") return undefined;
  const urls = (entry: unknown) => Array.isArray(entry)
    ? entry.flatMap((source) => {
        if (typeof source === "string") return [source];
        if (source && typeof source === "object" && typeof (source as Record<string, unknown>).url === "string") return [(source as Record<string, unknown>).url as string];
        return [];
      })
    : [];
  return { reportText: report.reportText, sources: urls(report.sources), furtherReading: urls(report.furtherReading) };
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function assetDataUrl(asset: { mimeType: string; data: Uint8Array }): string {
  return `data:${asset.mimeType};base64,${Buffer.from(asset.data).toString("base64")}`;
}

function assignmentDetails(assignment: { id: string; title: string; status: string; lessonPlan: unknown; sources: unknown }) {
  return {
    assignmentId: assignment.id,
    title: assignment.title,
    status: assignment.status === "published" ? "published" as const : "draft" as const,
    lessonPlan: typeof assignment.lessonPlan === "string" ? assignment.lessonPlan : "",
    sources: stringArray(assignment.sources),
  };
}

function mapStarstreamLog(log: StarstreamLogRow, viewerId: string): StarstreamLogPost {
  const visitor = parseVisitorNoteContent(log.content);
  const type = log.type === "visitorNote" || visitor ? "visitorNote" as const : "post" as const;
  return {
    id: log.id,
    voyageId: log.storyId,
    assignmentId: log.assignmentId,
    parentId: log.parentId,
    allowReplies: log.allowReplies,
    type,
    authorId: log.author.username,
    authorName: log.authorName ?? log.author.displayName,
    authorType: log.authorType === "bot" ? "bot" as const : "user" as const,
    body: starstreamLogBody(log.content),
    visitorNote: visitor
      ? {
          characterName: visitor.visitor.characterName,
          voyageTopic: visitor.visitor.voyageTopic,
          fact: visitor.visitor.fact,
          sources: visitor.visitor.sources,
          ...(visitor.commentary ? { commentary: visitor.commentary } : {}),
        }
      : undefined,
    attachments: starstreamAttachmentsView(log.attachments),
    createdAt: log.createdAt.toISOString(),
    likeCount: log._count.likes,
    likedByMe: log.likes.length > 0,
    replies: (log.replies ?? []).map((reply) => mapStarstreamLog(reply, viewerId)),
  };
}

async function snapshot(userId: string) {
  const actor = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, username: true },
  });
  if (!actor) throw new Error("Signed-in user was not found.");
  const isTeacher = actor.role === "teacher";
  const isStudent = actor.role === "student";
  const assignee = actor.username;
  const assignments = await prisma.classroomAssignment.findMany({
    where: isTeacher
      ? { classroom: { teacherId: userId } }
      : { classroom: { memberships: { some: { userId } } } },
    orderBy: { createdAt: "asc" },
    include: { story: true, journey: { include: { voyages: { orderBy: { position: "asc" }, include: { story: true } } } } },
  });
  const soloStories = isStudent
    ? await prisma.story.findMany({ where: { createdById: userId, status: "published" }, orderBy: { createdAt: "desc" } })
    : [];
  const progress = isStudent ? await prisma.voyageProgress.findMany({ where: { studentId: userId } }) : [];
  const progressByStory = new Map(progress.map((entry) => [entry.storyId, entry]));
  const stories = new Map<string, { id: string; slug: string; title: string; topic: string; period: string; scene: string; lessonPlan: string; sources: string[]; status: "draft" | "published"; publishedAt?: string; report?: unknown; ownerId?: string; stream?: "classroom" | "solo"; completed?: boolean; completedAt?: string; collectible?: { name: string; description: string; assetUrl: string } | null; cadetsCompleted?: number }>();
  const journeys = assignments.flatMap((assignment) => assignment.journey ? [{ id: assignment.journey.id, title: assignment.journey.title, description: assignment.journey.description ?? "", voyageIds: assignment.journey.voyages.map((voyage) => voyage.storyId), status: assignment.journey.status, assignedTo: assignee }] : []);
  for (const assignment of assignments) {
    const targets = assignment.story ? [assignment.story] : assignment.journey?.voyages.map((voyage) => voyage.story) ?? [];
    for (const story of targets) {
      const detail = storyDetails(story.storyJson, { title: assignment.story ? assignment.title : story.topic, scene: "Historical scene", period: "", lessonPlan: "Investigate the evidence.", sources: [] });
      const item = progressByStory.get(story.id);
      stories.set(story.id, { id: story.id, slug: story.slug, topic: story.topic, status: story.status === "published" ? "published" : "draft", publishedAt: story.publishedAt?.toISOString().slice(0, 10), report: reportView(story.report), stream: "classroom", completed: item?.completed ?? false, completedAt: item?.completedAt?.toISOString(), ...detail });
    }
  }
  for (const story of soloStories) {
    const detail = storyDetails(story.storyJson, { title: story.topic, scene: "Solo historical scene", period: "", lessonPlan: "Investigate the evidence.", sources: [] });
    const item = progressByStory.get(story.id);
    stories.set(story.id, { id: story.id, slug: story.slug, topic: story.topic, status: "published", publishedAt: story.publishedAt?.toISOString().slice(0, 10), report: reportView(story.report), ownerId: assignee, stream: "solo", completed: item?.completed ?? false, completedAt: item?.completedAt?.toISOString(), ...detail });
  }
  if (isStudent) {
    const completedStoryIds = [...stories.values()].filter((story) => story.completed).map((story) => story.id);
    if (completedStoryIds.length) {
      const collectibles = await prisma.collectible.findMany({
        where: { storyId: { in: completedStoryIds } },
        include: { asset: { select: { mimeType: true, data: true } } },
      });
      for (const collectible of collectibles) {
        const story = stories.get(collectible.storyId);
        if (!story) continue;
        stories.set(collectible.storyId, {
          ...story,
          collectible: {
            name: collectible.name,
            description: collectible.description,
            assetUrl: assetDataUrl(collectible.asset),
          },
        });
      }
    }
  }
  const classroom = await prisma.classroom.findFirst({
    where: isTeacher
      ? { teacherId: userId }
      : { memberships: { some: { userId } } },
    select: {
      id: true,
      name: true,
      sourceMode: true,
      approvedDomains: true,
      teacher: { select: { username: true, displayName: true } },
      memberships: {
        where: { user: { role: "student" } },
        orderBy: { user: { displayName: "asc" } },
        select: {
          userId: true,
          user: { select: { username: true, displayName: true } },
        },
      },
    },
  });
  const cadetIds = classroom?.memberships.map((membership) => membership.userId) ?? [];
  const cadetCount = cadetIds.length;
  const fieldNotes = await prisma.fieldNote.findMany({
    where: {
      AND: [
        { OR: [
          { assignmentId: { in: assignments.map((assignment) => assignment.id) } },
          { story: { createdById: userId } },
          { authorId: userId },
        ] },
        isStudent
          ? { OR: [{ status: "published" as const }, { authorId: userId }] }
          : { status: "published" as const },
      ],
    },
    orderBy: { createdAt: "desc" },
    include: { author: true, story: { select: { createdById: true } } },
  });
  const starstreamLikeInclude = {
    likes: { where: { userId }, select: { userId: true } },
    _count: { select: { likes: true } },
    author: { select: { username: true, displayName: true } },
  } as const;
  // Roots: classroom assignments, own solo stories, own posts (e.g. home visitor
  // notes with no assignment), and classmate visitor notes in the same classroom.
  const starstreamVisibility: Prisma.StarstreamLogWhereInput[] = [
    { assignmentId: { in: assignments.map((assignment) => assignment.id) } },
    { story: { createdById: userId } },
    { authorId: userId },
  ];
  if (cadetIds.length) {
    starstreamVisibility.push({
      type: "visitorNote",
      authorId: { in: isTeacher ? cadetIds : [...new Set([...cadetIds, userId])] },
    });
  }
  const starstreamRoots = await prisma.starstreamLog.findMany({
    where: {
      parentId: null,
      OR: starstreamVisibility,
    },
    orderBy: { createdAt: "desc" },
    include: {
      ...starstreamLikeInclude,
      replies: {
        orderBy: { createdAt: "asc" },
        include: starstreamLikeInclude,
      },
    },
  });
  const crew = classroom
    ? [
        {
          id: classroom.teacher.username,
          displayName: classroom.teacher.displayName,
          role: "teacher" as const,
        },
        ...classroom.memberships.map((membership) => ({
          id: membership.user.username,
          displayName: membership.user.displayName,
          role: "student" as const,
        })),
      ]
    : [];
  const publishedAssignmentStoryIds = [
    ...new Set(
      assignments
        .filter((assignment) => assignment.status === "published")
        .flatMap((assignment) =>
          assignment.story
            ? [assignment.story.id]
            : assignment.journey?.voyages.map((voyage) => voyage.storyId) ?? [],
        ),
    ),
  ];
  const storyIds = [...stories.keys()];
  const completedRows =
    storyIds.length && cadetIds.length
      ? await prisma.voyageProgress.findMany({
          where: {
            storyId: { in: storyIds },
            studentId: { in: cadetIds },
            completed: true,
          },
          select: { storyId: true },
        })
      : [];
  const completedByStory = new Map<string, number>();
  for (const row of completedRows) {
    completedByStory.set(row.storyId, (completedByStory.get(row.storyId) ?? 0) + 1);
  }
  for (const [storyId, story] of stories) {
    stories.set(storyId, {
      ...story,
      cadetsCompleted: completedByStory.get(storyId) ?? 0,
    });
  }
  const cadetProgressRows =
    isTeacher && cadetIds.length && publishedAssignmentStoryIds.length
      ? await prisma.voyageProgress.findMany({
          where: {
            studentId: { in: cadetIds },
            storyId: { in: publishedAssignmentStoryIds },
          },
          select: { studentId: true, storyId: true, completed: true },
        })
      : [];
  const completedByCadet = new Map<string, Set<string>>();
  for (const row of cadetProgressRows) {
    if (!row.completed) continue;
    const set = completedByCadet.get(row.studentId) ?? new Set<string>();
    set.add(row.storyId);
    completedByCadet.set(row.studentId, set);
  }
  const lastPostsByAuthor =
    isTeacher && cadetIds.length
      ? await prisma.starstreamLog.findMany({
          where: {
            parentId: null,
            authorId: { in: cadetIds },
            authorType: "user",
            OR: [
              ...(assignments.length
                ? [{ assignmentId: { in: assignments.map((assignment) => assignment.id) } }]
                : []),
              { story: { createdById: { in: cadetIds } } },
            ],
          },
          orderBy: { createdAt: "desc" },
          distinct: ["authorId"],
          select: {
            id: true,
            authorId: true,
            content: true,
            createdAt: true,
            story: { select: { topic: true, storyJson: true } },
          },
        })
      : [];
  const lastPostByCadetId = new Map(
    lastPostsByAuthor.map((log) => {
      const detail = storyDetails(log.story.storyJson, {
        title: log.story.topic,
        scene: "",
        period: "",
        lessonPlan: "",
        sources: [],
      });
      return [
        log.authorId,
        {
          id: log.id,
          body: starstreamLogBody(log.content),
          createdAt: log.createdAt.toISOString(),
          voyageTitle: detail.title,
        },
      ] as const;
    }),
  );
  const assignmentsTotal = publishedAssignmentStoryIds.length;
  const cadets = isTeacher
    ? (classroom?.memberships.map((membership) => {
        const complete = completedByCadet.get(membership.userId)?.size ?? 0;
        const lastPost = lastPostByCadetId.get(membership.userId) ?? null;
        return {
          id: membership.user.username,
          displayName: membership.user.displayName,
          assignmentsComplete: complete,
          assignmentsTotal,
          progress:
            assignmentsTotal > 0
              ? Math.round((complete / assignmentsTotal) * 100)
              : 0,
          lastPost,
        };
      }) ?? [])
    : [];
  return {
    voyages: [...stories.values()],
    journeys,
    assignments: assignments.flatMap((assignment) => {
      const details = assignmentDetails(assignment);
      const voyageIds = assignment.story ? [assignment.story.id] : assignment.journey?.voyages.map((voyage) => voyage.storyId) ?? [];
      const voyageAssignments = voyageIds.map((voyageId) => {
        const item = progress.find((entry) => entry.storyId === voyageId);
        return { id: `${assignment.id}-${voyageId}`, ...details, kind: "voyage" as const, voyageId, ...(assignment.journey ? { journeyId: assignment.journey.id } : {}), assignedTo: assignee, state: item?.completed ? "complete" as const : item ? "in-progress" as const : "not-started" as const, progress: item?.completed ? 100 : item ? 50 : 0, due: item?.completed ? "Complete" : "Friday" };
      });
      return assignment.journey ? [{ id: assignment.id, ...details, kind: "journey" as const, journeyId: assignment.journey.id, assignedTo: assignee, state: "in-progress" as const, progress: Math.round(voyageAssignments.reduce((sum, item) => sum + item.progress, 0) / Math.max(1, voyageAssignments.length)), due: "Friday" }, ...voyageAssignments] : voyageAssignments;
    }),
    fieldNotes: fieldNotes.map((note) => ({ id: note.id, voyageId: note.storyId, authorId: note.author.username, authorName: note.authorName ?? note.author.displayName, authorType: note.authorType, sources: Array.isArray(note.sources) ? note.sources.filter((source): source is string => typeof source === "string") : [], body: takeawayNoteBody(note.content).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(), status: note.status === "published" ? "published" as const : "draft" as const, createdAt: note.createdAt.toISOString() })),
    starstreamLogs: starstreamRoots.map((log) => mapStarstreamLog(log, userId)),
    classroom: classroom
      ? (() => {
          const policy = sourcePolicyFromClassroom(classroom);
          return {
            id: classroom.id,
            name: classroom.name,
            sourceMode: policy.sourceMode,
            approvedDomains: policy.approvedDomains,
            cadetCount,
          };
        })()
      : null,
    crew,
    cadets,
  };
}

export async function GET(request: Request) {
  try {
    const user = await requireDemoUser(request);
    return NextResponse.json(await snapshot(user.id));
  } catch (error) {
    return errorResponse(error, "Could not load Nexus.");
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireDemoUser(request);
    const body = parseJsonBody<NexusBody>(await request.json());
    const action = requiredText(body.action, "action");
    const payload = body.payload && typeof body.payload === "object" ? body.payload as Record<string, unknown> : {};
    if (user.role === "teacher" && (action === "publish-voyage" || action === "save-voyage")) {
      const title = requiredText(payload.title, "title");
      const status = action === "publish-voyage" ? "published" as const : "draft" as const;
      const existingStoryId = typeof payload.storyId === "string" && payload.storyId.trim() ? payload.storyId.trim() : undefined;
      const classroom = await prisma.classroom.findFirst({ where: { teacherId: user.id } });
      if (!classroom) throw new Error("Demo classroom is not initialized.");
      if (existingStoryId) {
        const existingStory = await prisma.story.findUnique({ where: { id: existingStoryId }, select: { id: true, createdById: true, storyJson: true } });
        if (!existingStory) throw new Error("Generated voyage was not found.");
        if (existingStory.createdById && existingStory.createdById !== user.id) throw new Error("You cannot publish another teacher's voyage.");
        const existingJson = existingStory.storyJson && typeof existingStory.storyJson === "object" && !Array.isArray(existingStory.storyJson) ? existingStory.storyJson as Record<string, unknown> : {};
        await prisma.story.update({ where: { id: existingStoryId }, data: { status, publishedAt: status === "published" ? new Date() : null, publishedById: status === "published" ? user.id : null, storyJson: jsonInput({ ...existingJson, title, scene: payload.scene, period: payload.period, lessonPlan: payload.lessonPlan, sources: payload.sources }, "storyJson") } });
        const existingAssignment = await prisma.classroomAssignment.findFirst({ where: { classroomId: classroom.id, storyId: existingStoryId } });
        if (existingAssignment) {
          await prisma.classroomAssignment.update({ where: { id: existingAssignment.id }, data: { title, status, lessonPlan: jsonInput(payload.lessonPlan ?? "", "lessonPlan"), sources: jsonInput(payload.sources ?? [], "sources"), publishedAt: status === "published" ? new Date() : null } });
        } else {
          await prisma.classroomAssignment.create({ data: { classroomId: classroom.id, createdById: user.id, storyId: existingStoryId, title, status, lessonPlan: jsonInput(payload.lessonPlan ?? "", "lessonPlan"), sources: jsonInput(payload.sources ?? [], "sources"), publishedAt: status === "published" ? new Date() : null } });
        }
        return NextResponse.json(await snapshot(user.id));
      }
      const story = await prisma.story.create({ data: { slug: `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now()}`, topic: requiredText(payload.topic, "topic"), synopsis: jsonInput({ scene: requiredText(payload.scene, "scene") }, "synopsis"), storyJson: jsonInput({ title, scene: payload.scene, period: payload.period, lessonPlan: payload.lessonPlan, sources: payload.sources }, "storyJson"), status, publishedAt: status === "published" ? new Date() : null, publishedById: status === "published" ? user.id : null } });
      await prisma.classroomAssignment.create({ data: { classroomId: classroom.id, createdById: user.id, storyId: story.id, title, status, lessonPlan: jsonInput(payload.lessonPlan ?? "", "lessonPlan"), sources: jsonInput(payload.sources ?? [], "sources"), publishedAt: status === "published" ? new Date() : null } });
      return NextResponse.json(await snapshot(user.id));
    }
    if (user.role === "teacher" && (action === "publish-journey" || action === "save-journey")) {
      const title = requiredText(payload.title, "title");
      const voyageIds = Array.isArray(payload.voyageIds) ? payload.voyageIds.filter((id): id is string => typeof id === "string") : [];
      if (!voyageIds.length) throw new Error("A journey needs at least one voyage.");
      const classroom = await prisma.classroom.findFirst({ where: { teacherId: user.id } });
      if (!classroom) throw new Error("Demo classroom is not initialized.");
      const status = action === "publish-journey" ? "published" as const : "draft" as const;
      const journey = await prisma.journey.create({ data: { title, description: requiredText(payload.description, "description"), createdById: user.id, status, publishedAt: status === "published" ? new Date() : null, voyages: { create: voyageIds.map((storyId, position) => ({ storyId, position })) } } });
      await prisma.classroomAssignment.create({ data: { classroomId: classroom.id, createdById: user.id, journeyId: journey.id, title, status, publishedAt: status === "published" ? new Date() : null } });
      return NextResponse.json(await snapshot(user.id));
    }
    if (user.role === "student" && (action === "publish-field-note" || action === "save-field-note")) {
      const voyageId = requiredText(payload.voyageId, "voyageId");
      const noteBody = requiredText(payload.body, "body");
      const assignment = await prisma.classroomAssignment.findFirst({
        where: {
          status: "published",
          classroom: { memberships: { some: { userId: user.id } } },
          OR: [
            { storyId: voyageId },
            { journey: { voyages: { some: { storyId: voyageId } } } },
          ],
        },
        orderBy: { updatedAt: "desc" },
      });
      if (!assignment) throw new Error("Voyage assignment not found.");
      const status = action === "publish-field-note" ? "published" as const : "draft" as const;
      const candidates = await prisma.fieldNote.findMany({
        where: { assignmentId: assignment.id, storyId: voyageId, authorId: user.id, authorType: "user" },
        orderBy: { updatedAt: "desc" },
      });
      const existing = candidates.find((note) => isTakeawayNoteContent(note.content));
      if (existing) {
        const note = await prisma.fieldNote.update({
          where: { id: existing.id },
          data: {
            content: { body: noteBody },
            status,
            publishedAt: status === "published" ? (existing.status === "published" && existing.publishedAt ? existing.publishedAt : new Date()) : null,
            publishedById: status === "published" ? (existing.publishedById ?? user.id) : null,
          },
        });
        await syncStarstreamLogFromFieldNote(note);
      } else {
        const note = await prisma.fieldNote.create({
          data: {
            assignmentId: assignment.id,
            storyId: voyageId,
            authorId: user.id,
            content: { body: noteBody },
            status,
            publishedAt: status === "published" ? new Date() : null,
            publishedById: status === "published" ? user.id : null,
          },
        });
        await syncStarstreamLogFromFieldNote(note);
      }
      return NextResponse.json(await snapshot(user.id));
    }
    if (user.role === "student" && action === "complete-voyage") {
      const voyageId = requiredText(payload.voyageId, "voyageId");
      const assignment = await prisma.classroomAssignment.findFirst({ where: { status: "published", OR: [{ storyId: voyageId }, { journey: { voyages: { some: { storyId: voyageId } } } }], classroom: { memberships: { some: { userId: user.id } } } } });
      if (assignment) {
        const note = await prisma.fieldNote.findFirst({ where: { assignmentId: assignment.id, storyId: voyageId, authorId: user.id, status: "published" }, select: { id: true } });
        if (!note) throw new Error("Publish a field note before completing this voyage.");
      } else {
        const soloStory = await prisma.story.findFirst({ where: { id: voyageId, createdById: user.id, status: "published" }, select: { id: true } });
        if (!soloStory) throw new Error("Voyage is not available to this cadet.");
      }
      await prisma.voyageProgress.upsert({ where: { studentId_storyId: { studentId: user.id, storyId: voyageId } }, create: { studentId: user.id, storyId: voyageId, assignmentId: assignment?.id, progress: { completed: true }, completed: true, completedAt: new Date() }, update: { assignmentId: assignment?.id, progress: { completed: true }, completed: true, completedAt: new Date() } });
      return NextResponse.json(await snapshot(user.id));
    }
    if (action === "toggle-starstream-like") {
      const logId = requiredText(payload.logId, "logId");
      const log = await prisma.starstreamLog.findUnique({
        where: { id: logId },
        select: {
          id: true,
          assignmentId: true,
          story: { select: { createdById: true } },
          assignment: {
            select: {
              classroom: {
                select: { teacherId: true, memberships: { where: { userId: user.id }, select: { userId: true } } },
              },
            },
          },
        },
      });
      if (!log) throw new Error("Starstream post not found.");
      const isClassroomMember =
        log.assignment?.classroom.teacherId === user.id ||
        Boolean(log.assignment?.classroom.memberships.length);
      const isSoloOwner = log.story.createdById === user.id;
      if (!isClassroomMember && !isSoloOwner) throw new Error("You cannot like this post.");
      const result = await toggleStarstreamLike(logId, user.id);
      if ("error" in result) throw new Error("Starstream post not found.");
      return NextResponse.json(await snapshot(user.id));
    }
    throw new Error("Unsupported Nexus action.");
  } catch (error) {
    return errorResponse(error, "Could not sync Nexus.");
  }
}
