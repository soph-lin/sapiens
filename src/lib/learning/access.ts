import type { User, PublicationStatus } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/learning/api";

export const assignmentAccessInclude = {
  classroom: { select: { id: true, name: true, teacherId: true, sourceMode: true, approvedDomains: true, memberships: { select: { userId: true } } } },
  story: { select: { id: true, slug: true, topic: true, status: true } },
  journey: {
    include: {
      voyages: {
        orderBy: { position: "asc" as const },
        select: { id: true, position: true, story: { select: { id: true, slug: true, topic: true, status: true } } },
      },
    },
  },
} as const;

export type AssignmentWithAccess = Awaited<ReturnType<typeof findAssignmentForAccess>>;

export async function findAssignmentForAccess(id: string) {
  return prisma.classroomAssignment.findUnique({ where: { id }, include: assignmentAccessInclude });
}

export function assignmentStoryIds(assignment: NonNullable<AssignmentWithAccess>) {
  return assignment.story
    ? [assignment.story.id]
    : assignment.journey?.voyages.map((voyage) => voyage.story.id) ?? [];
}

export function assignmentIncludesStory(assignment: NonNullable<AssignmentWithAccess>, storyId: string) {
  return assignmentStoryIds(assignment).includes(storyId);
}

function studentCanSeePublishedAssignment(assignment: NonNullable<AssignmentWithAccess>, userId: string) {
  const isMember = assignment.classroom.memberships.some((membership) => membership.userId === userId);
  if (!isMember || assignment.status !== "published") return false;
  if (assignment.story) return assignment.story.status === "published";
  return assignment.journey?.status === "published" && assignment.journey.voyages.every((voyage) => voyage.story.status === "published");
}

export function assertAssignmentVisible(
  assignment: NonNullable<AssignmentWithAccess>,
  user: Pick<User, "id" | "role">,
) {
  if (user.role === "teacher" && assignment.classroom.teacherId === user.id) return;
  if (user.role === "student" && studentCanSeePublishedAssignment(assignment, user.id)) return;
  throw new ApiError(404, "Assignment not found.");
}

export function assertPublishedTargetStory(
  assignment: NonNullable<AssignmentWithAccess>,
  storyId: string,
) {
  if (!assignmentIncludesStory(assignment, storyId)) {
    throw new ApiError(400, "storyId must target a voyage in this assignment.");
  }
  const target = assignment.story?.id === storyId
    ? assignment.story
    : assignment.journey?.voyages.find((voyage) => voyage.story.id === storyId)?.story;
  if (!target || target.status !== "published") {
    throw new ApiError(400, "The target voyage must be published.");
  }
}

export function toAssignmentView(assignment: NonNullable<AssignmentWithAccess>) {
  return {
    id: assignment.id,
    title: assignment.title,
    status: assignment.status,
    learningGuide: assignment.learningGuide,
    lessonPlan: assignment.lessonPlan,
    sources: assignment.sources,
    publishedAt: assignment.publishedAt,
    createdAt: assignment.createdAt,
    updatedAt: assignment.updatedAt,
    classroom: assignment.classroom,
    target: assignment.story
      ? { type: "story" as const, story: assignment.story }
      : {
          type: "journey" as const,
          journey: assignment.journey
            ? {
                id: assignment.journey.id,
                title: assignment.journey.title,
                description: assignment.journey.description,
                status: assignment.journey.status,
                voyages: assignment.journey.voyages,
              }
            : null,
        },
  };
}

export const published: PublicationStatus = "published";
