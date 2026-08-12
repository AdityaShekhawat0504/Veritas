// Local-dev seed: clones the shared demo sample theses under a single demo
// user, so the app is explorable without going through Google sign-in.
//
// NOTE: in v1 real users are NEVER auto-seeded — their dashboard starts empty
// and they opt in via "Load samples" (see lib/db.cloneSamplesForUser). This
// script exists only for local development against the database.
//
// Run via `npx prisma db seed` (loads .env) or `npm run db:reset`.

import { PrismaClient } from "@prisma/client";
import { SAMPLE_THESES, buildSampleCreateData } from "../lib/sampleTheses";

const prisma = new PrismaClient();

const DEMO_EMAIL = "demo@veritas.local";

async function main() {
  const user = await prisma.user.upsert({
    where: { email: DEMO_EMAIL },
    update: {},
    create: { email: DEMO_EMAIL, name: "Demo Analyst" },
  });

  // Clean slate for the demo user only.
  await prisma.thesis.deleteMany({ where: { userId: user.id } });

  for (const sample of SAMPLE_THESES) {
    const data = buildSampleCreateData(sample, user.id);
    await prisma.thesis.create({ data });
    console.log(`  seeded: ${sample.actor} — integrity ${data.integrityScore}`);
  }
}

main()
  .then(() => console.log("Seed complete."))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
