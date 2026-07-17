CREATE TYPE "DemoUserRole" AS ENUM ('teacher', 'student');
CREATE TYPE "PublicationStatus" AS ENUM ('draft', 'published', 'archived');

ALTER TABLE "Story"
  ADD COLUMN "publishedAt" TIMESTAMP(3),
  ADD COLUMN "publishedById" TEXT,
  ADD COLUMN "status" "PublicationStatus" NOT NULL DEFAULT 'draft';

CREATE TABLE "DemoUser" (
  "id" TEXT NOT NULL,
  "username" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "role" "DemoUserRole" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DemoUser_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DemoUser_username_key" ON "DemoUser"("username");

CREATE TABLE "Classroom" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "teacherId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Classroom_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Classroom_teacherId_idx" ON "Classroom"("teacherId");

CREATE TABLE "ClassroomMembership" (
  "id" TEXT NOT NULL,
  "classroomId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ClassroomMembership_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ClassroomMembership_classroomId_userId_key" ON "ClassroomMembership"("classroomId", "userId");
CREATE INDEX "ClassroomMembership_userId_idx" ON "ClassroomMembership"("userId");

CREATE TABLE "Journey" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "status" "PublicationStatus" NOT NULL DEFAULT 'draft',
  "createdById" TEXT NOT NULL,
  "publishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Journey_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Journey_createdById_idx" ON "Journey"("createdById");
CREATE INDEX "Journey_status_idx" ON "Journey"("status");

CREATE TABLE "JourneyVoyage" (
  "id" TEXT NOT NULL,
  "journeyId" TEXT NOT NULL,
  "storyId" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  CONSTRAINT "JourneyVoyage_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "JourneyVoyage_journeyId_position_key" ON "JourneyVoyage"("journeyId", "position");
CREATE UNIQUE INDEX "JourneyVoyage_journeyId_storyId_key" ON "JourneyVoyage"("journeyId", "storyId");
CREATE INDEX "JourneyVoyage_storyId_idx" ON "JourneyVoyage"("storyId");

CREATE TABLE "ClassroomAssignment" (
  "id" TEXT NOT NULL,
  "classroomId" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "storyId" TEXT,
  "journeyId" TEXT,
  "title" TEXT NOT NULL,
  "status" "PublicationStatus" NOT NULL DEFAULT 'draft',
  "learningGuide" JSONB,
  "lessonPlan" JSONB,
  "sources" JSONB,
  "publishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ClassroomAssignment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ClassroomAssignment_one_target_check" CHECK (num_nonnulls("storyId", "journeyId") = 1)
);
CREATE INDEX "ClassroomAssignment_classroomId_status_idx" ON "ClassroomAssignment"("classroomId", "status");
CREATE INDEX "ClassroomAssignment_createdById_idx" ON "ClassroomAssignment"("createdById");
CREATE INDEX "ClassroomAssignment_storyId_idx" ON "ClassroomAssignment"("storyId");
CREATE INDEX "ClassroomAssignment_journeyId_idx" ON "ClassroomAssignment"("journeyId");

CREATE TABLE "FieldNote" (
  "id" TEXT NOT NULL,
  "assignmentId" TEXT NOT NULL,
  "storyId" TEXT NOT NULL,
  "authorId" TEXT NOT NULL,
  "title" TEXT,
  "content" JSONB NOT NULL,
  "status" "PublicationStatus" NOT NULL DEFAULT 'draft',
  "publishedById" TEXT,
  "publishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FieldNote_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "FieldNote_assignmentId_storyId_status_idx" ON "FieldNote"("assignmentId", "storyId", "status");
CREATE INDEX "FieldNote_authorId_idx" ON "FieldNote"("authorId");

CREATE TABLE "StudentVoyageProgress" (
  "id" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "storyId" TEXT NOT NULL,
  "assignmentId" TEXT NOT NULL,
  "progress" JSONB NOT NULL,
  "completed" BOOLEAN NOT NULL DEFAULT false,
  "currentNodeId" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StudentVoyageProgress_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "StudentVoyageProgress_studentId_storyId_key" ON "StudentVoyageProgress"("studentId", "storyId");
CREATE INDEX "StudentVoyageProgress_assignmentId_idx" ON "StudentVoyageProgress"("assignmentId");
CREATE INDEX "StudentVoyageProgress_storyId_idx" ON "StudentVoyageProgress"("storyId");

ALTER TABLE "Story" ADD CONSTRAINT "Story_publishedById_fkey" FOREIGN KEY ("publishedById") REFERENCES "DemoUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Classroom" ADD CONSTRAINT "Classroom_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "DemoUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClassroomMembership" ADD CONSTRAINT "ClassroomMembership_classroomId_fkey" FOREIGN KEY ("classroomId") REFERENCES "Classroom"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClassroomMembership" ADD CONSTRAINT "ClassroomMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "DemoUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Journey" ADD CONSTRAINT "Journey_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "DemoUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JourneyVoyage" ADD CONSTRAINT "JourneyVoyage_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "Journey"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JourneyVoyage" ADD CONSTRAINT "JourneyVoyage_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "Story"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClassroomAssignment" ADD CONSTRAINT "ClassroomAssignment_classroomId_fkey" FOREIGN KEY ("classroomId") REFERENCES "Classroom"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClassroomAssignment" ADD CONSTRAINT "ClassroomAssignment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "DemoUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClassroomAssignment" ADD CONSTRAINT "ClassroomAssignment_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "Story"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClassroomAssignment" ADD CONSTRAINT "ClassroomAssignment_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "Journey"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FieldNote" ADD CONSTRAINT "FieldNote_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "ClassroomAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FieldNote" ADD CONSTRAINT "FieldNote_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "Story"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FieldNote" ADD CONSTRAINT "FieldNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "DemoUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FieldNote" ADD CONSTRAINT "FieldNote_publishedById_fkey" FOREIGN KEY ("publishedById") REFERENCES "DemoUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StudentVoyageProgress" ADD CONSTRAINT "StudentVoyageProgress_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "DemoUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudentVoyageProgress" ADD CONSTRAINT "StudentVoyageProgress_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "Story"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudentVoyageProgress" ADD CONSTRAINT "StudentVoyageProgress_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "ClassroomAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "DemoUser" ("id", "username", "displayName", "role") VALUES
  ('demo-darwin', 'darwin', 'Darwin', 'teacher'),
  ('demo-galileo', 'galileo', 'Galileo', 'student');
INSERT INTO "Classroom" ("id", "name", "teacherId", "updatedAt") VALUES ('demo-classroom', 'Darwin''s field school', 'demo-darwin', CURRENT_TIMESTAMP);
INSERT INTO "ClassroomMembership" ("id", "classroomId", "userId") VALUES
  ('demo-membership-darwin', 'demo-classroom', 'demo-darwin'),
  ('demo-membership-galileo', 'demo-classroom', 'demo-galileo');

CREATE INDEX "Story_status_idx" ON "Story"("status");
CREATE INDEX "Story_publishedById_idx" ON "Story"("publishedById");
