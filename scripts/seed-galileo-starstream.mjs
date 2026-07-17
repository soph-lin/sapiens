import { config } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.ts";

config({ path: ".env.local" });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });

const TAKEAWAYS = [
  {
    usernameHint: null,
    body: "ok so galileo pointing that telescope at jupiter and finding moons??? that kinda broke my brain. like people just believed earth was the center forever and he was like nah look at this. wild that looking harder at the sky could flip the whole story.",
    allowReplies: true,
  },
  {
    usernameHint: null,
    body: "I kept thinking about how mad people got at him. Not even cuz he was mean, just cuz he showed proof that the old idea was wrong. Makes me wonder how many times we do that now. Also the moons of Jupiter are actually so cool??",
    allowReplies: true,
  },
  {
    usernameHint: null,
    body: "takeaway: galileo was stubborn in a good way. he drew what he saw instead of what everyone told him he should see. i lowkey respect that. the telescope part made the voyage feel real, not just textbook.",
    allowReplies: true,
  },
  {
    usernameHint: null,
    body: "Honestly I didn't know people used to argue this hard about planets. Galileo mapping the sky felt like detective work. My favorite bit was realizing the moons weren't decorations, they were evidence.",
    allowReplies: true,
  },
  {
    usernameHint: null,
    body: "yo the part where the church / professors didn't want to look through the telescope??? i was yelling at my screen. if someone shows you receipts you gotta at least look. finished the voyage tho. jupiter's moons = main character energy.",
    allowReplies: true,
  },
  {
    usernameHint: null,
    body: "Galileo made science feel messy, which I weirdly liked. He wasn't perfect, he just kept checking. I think my takeaway is that new tools (telescopes) can make old answers look silly really fast.",
    allowReplies: false,
  },
  {
    usernameHint: null,
    body: "before this i thought galileo was just 'the telescope guy.' now i get that he was fighting a whole worldview. the sky wasn't a ceiling, it was a system. still kinda confusing but in a good way.",
    allowReplies: true,
  },
  {
    usernameHint: null,
    body: "Completed Galileo Maps a New Sky!! My brain is full. Main thought: evidence > vibes. Also he got in trouble for being right which is extremely unfair and also extremely on brand for history.",
    allowReplies: true,
  },
  {
    usernameHint: null,
    body: "ngl some of the old astronomy ideas sounded kinda cozy (earth in the middle, everything revolving around us) but cozy isn't the same as true. galileo ruined the cozy story and i respect him for it.",
    allowReplies: true,
  },
  {
    usernameHint: null,
    body: "I liked learning that mapping the sky wasn't just art, it was an argument. Every sketch of Jupiter's moons was basically Galileo saying 'please stop ignoring this.' Felt different from regular history class.",
    allowReplies: true,
  },
  {
    usernameHint: null,
    body: "galileo seems tired but determined which is a mood. pointing a tube at the night sky and rewriting physics is insane. my takeaway is pay attention even when adults say the answer is already settled.",
    allowReplies: true,
  },
  {
    usernameHint: null,
    body: "So... Earth isn't the special center of everything. Got it. That hit harder than I expected. Also the moons moving around Jupiter made the solar system feel less like a poster and more like stuff actually happening.",
    allowReplies: true,
  },
];

const REPLY_SETS = [
  {
    rootIndex: 0,
    replies: [
      { fromOffset: 1, body: "right??? the moons are the part that stuck with me too" },
      { fromOffset: 4, body: "bro same i need a telescope now" },
    ],
  },
  {
    rootIndex: 1,
    replies: [
      { fromOffset: 2, body: "yes the 'people got mad at proof' thing is so real" },
    ],
  },
  {
    rootIndex: 3,
    replies: [
      { fromOffset: 1, body: "detective work is the perfect way to put it" },
      { fromOffset: 5, body: "yeah every moon sketch was receipts" },
    ],
  },
  {
    rootIndex: 4,
    replies: [
      { fromOffset: 0, body: "the not looking thru the telescope scene was crazy" },
      { fromOffset: 2, body: "receipts!!! exactly" },
      { fromOffset: 6, body: "lowkey that made me mad for him" },
    ],
  },
  {
    rootIndex: 7,
    replies: [
      { fromOffset: 3, body: "evidence > vibes is going on my wall" },
      { fromOffset: 5, body: "history really said 'congrats ur right, also big trouble'" },
    ],
  },
];

function cuidLike(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

async function main() {
  const assignment = await prisma.classroomAssignment.findFirst({
    where: {
      title: { equals: "Galileo Maps a New Sky", mode: "insensitive" },
      status: "published",
    },
    include: {
      story: { select: { id: true, slug: true, topic: true, status: true, storyJson: true } },
      classroom: {
        include: {
          memberships: {
            where: { user: { role: "student" } },
            include: { user: { select: { id: true, username: true, displayName: true } } },
            orderBy: { user: { username: "asc" } },
          },
        },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  if (!assignment?.storyId || !assignment.story) {
    throw new Error('No published assignment titled "Galileo Maps a New Sky" with a story.');
  }

  const story = assignment.story;
  console.log("Using assignment/story:", {
    assignmentId: assignment.id,
    title: assignment.title,
    storyId: story.id,
    slug: story.slug,
    topic: story.topic,
  });

  const students = assignment.classroom.memberships.map((m) => m.user);
  if (!students.length) {
    throw new Error("No students in the classroom for this assignment.");
  }

  console.log(
    `Classroom ${assignment.classroom.name}: ${students.length} students`,
    students.map((s) => s.username),
  );

  // Replace prior user-authored notes/logs for these students on this voyage so re-runs are idempotent.
  const existingUserNotes = await prisma.fieldNote.findMany({
    where: {
      storyId: story.id,
      assignmentId: assignment.id,
      authorType: "user",
      authorId: { in: students.map((s) => s.id) },
    },
    select: { id: true },
  });
  if (existingUserNotes.length) {
    await prisma.starstreamLog.deleteMany({
      where: {
        OR: [
          { fieldNoteId: { in: existingUserNotes.map((n) => n.id) } },
          {
            storyId: story.id,
            assignmentId: assignment.id,
            authorId: { in: students.map((s) => s.id) },
          },
        ],
      },
    });
    await prisma.fieldNote.deleteMany({
      where: { id: { in: existingUserNotes.map((n) => n.id) } },
    });
  }

  const now = Date.now();
  const rootLogs = [];

  for (let i = 0; i < students.length; i++) {
    const student = students[i];
    const takeaway = TAKEAWAYS[i % TAKEAWAYS.length];
    const publishedAt = new Date(now - (students.length - i) * 36e5 - Math.floor(Math.random() * 2e6));

    const note = await prisma.fieldNote.create({
      data: {
        assignmentId: assignment.id,
        storyId: story.id,
        authorId: student.id,
        authorType: "user",
        authorName: student.displayName,
        title: "Voyage takeaway",
        content: { body: takeaway.body },
        status: "published",
        publishedById: student.id,
        publishedAt,
        createdAt: publishedAt,
        updatedAt: publishedAt,
      },
    });

    const log = await prisma.starstreamLog.create({
      data: {
        parentId: null,
        allowReplies: takeaway.allowReplies,
        assignmentId: assignment.id,
        storyId: story.id,
        authorId: student.id,
        authorType: "user",
        authorName: student.displayName,
        fieldNoteId: note.id,
        title: "Voyage takeaway",
        content: { body: takeaway.body },
        attachments: [],
        createdAt: publishedAt,
        updatedAt: publishedAt,
      },
    });

    await prisma.studentVoyageProgress.upsert({
      where: {
        studentId_storyId: { studentId: student.id, storyId: story.id },
      },
      create: {
        studentId: student.id,
        storyId: story.id,
        assignmentId: assignment.id,
        progress: { completed: true, mockSeed: "galileo-starstream" },
        completed: true,
        completedAt: publishedAt,
        startedAt: new Date(publishedAt.getTime() - 45 * 60e3),
      },
      update: {
        assignmentId: assignment.id,
        progress: { completed: true, mockSeed: "galileo-starstream" },
        completed: true,
        completedAt: publishedAt,
      },
    });

    rootLogs.push({ log, student, allowReplies: takeaway.allowReplies });
  }

  let replyCount = 0;
  for (const set of REPLY_SETS) {
    const root = rootLogs[set.rootIndex];
    if (!root || !root.allowReplies) continue;
    for (const [j, reply] of set.replies.entries()) {
      const author = students[(set.rootIndex + reply.fromOffset) % students.length];
      if (author.id === root.student.id) continue;
      const createdAt = new Date(root.log.createdAt.getTime() + (j + 1) * 15 * 60e3);
      await prisma.starstreamLog.create({
        data: {
          id: cuidLike("reply"),
          parentId: root.log.id,
          allowReplies: false,
          assignmentId: assignment.id,
          storyId: story.id,
          authorId: author.id,
          authorType: "user",
          authorName: author.displayName,
          title: null,
          content: { body: reply.body },
          attachments: [],
          createdAt,
          updatedAt: createdAt,
        },
      });
      replyCount += 1;
    }
  }

  console.log(
    JSON.stringify(
      {
        story: { id: story.id, topic: story.topic, slug: story.slug },
        assignmentId: assignment.id,
        students: students.map((s) => s.username),
        rootPosts: rootLogs.length,
        replies: replyCount,
      },
      null,
      2,
    ),
  );

  const verify = await prisma.starstreamLog.findMany({
    where: { assignmentId: assignment.id, parentId: null },
    include: {
      author: { select: { username: true } },
      replies: { include: { author: { select: { username: true } } }, orderBy: { createdAt: "asc" } },
    },
    orderBy: { createdAt: "asc" },
  });
  for (const root of verify) {
    const body =
      root.content && typeof root.content === "object" && "body" in root.content
        ? String(root.content.body)
        : JSON.stringify(root.content);
    console.log(`\n[${root.author.username}] allowReplies=${root.allowReplies}`);
    console.log(`  ${body.slice(0, 100)}${body.length > 100 ? "…" : ""}`);
    for (const reply of root.replies) {
      const replyBody =
        reply.content && typeof reply.content === "object" && "body" in reply.content
          ? String(reply.content.body)
          : JSON.stringify(reply.content);
      console.log(`  ↳ ${reply.author.username} (parentId→${reply.parentId.slice(0, 8)}…): ${replyBody}`);
    }
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
