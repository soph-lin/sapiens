import { config } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.ts";

config({ path: ".env.local" });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });

const STORY_SLUG_PREFIX = "the-weight-of-a-grain";
const JOURNEY_TITLE = "Measures of Meaning";

async function main() {
  const stories = await prisma.story.findMany({
    where: { slug: { startsWith: STORY_SLUG_PREFIX } },
    select: { id: true, slug: true, topic: true },
  });

  const journeys = await prisma.journey.findMany({
    where: { title: JOURNEY_TITLE },
    select: { id: true, title: true },
  });

  for (const journey of journeys) {
    await prisma.journey.delete({ where: { id: journey.id } });
    console.log(`Deleted journey ${journey.title} (${journey.id})`);
  }

  for (const story of stories) {
    await prisma.story.delete({ where: { id: story.id } });
    console.log(`Deleted story ${story.topic} (${story.slug})`);
  }

  if (!stories.length && !journeys.length) {
    console.log("No mock Weight of a Grain records found.");
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
