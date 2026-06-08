// Data access layer. The rest of the app talks to the DB ONLY through here —
// no component, page, or route handler imports PrismaClient directly.

import { PrismaClient } from "@prisma/client";
import type {
  ThesisCardData,
  ThesisWithRelations,
  DecomposedThesis,
} from "./types";
import { computeIntegrityScore } from "./score";

// Singleton — avoid exhausting connections under Next.js hot-reload.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
const prisma = globalForPrisma.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

/** Dashboard: every thesis, sorted by integrity ascending (breaks float to top). */
export async function getThesesForDashboard(): Promise<ThesisCardData[]> {
  const theses = await prisma.thesis.findMany({
    orderBy: { integrityScore: "asc" },
    include: {
      assumptions: { select: { criticality: true, status: true } },
    },
  });
  return theses as ThesisCardData[];
}

/** Detail page: one thesis with assumptions (+evidence), decision, and check history. */
export async function getThesisById(
  id: string,
): Promise<ThesisWithRelations | null> {
  const thesis = await prisma.thesis.findUnique({
    where: { id },
    include: {
      assumptions: {
        orderBy: [{ criticality: "asc" }, { id: "asc" }],
        include: { evidence: true },
      },
      decision: true,
      checks: { orderBy: { createdAt: "asc" } },
    },
  });
  return thesis as ThesisWithRelations | null;
}

/**
 * Persist a decomposed thesis and its nested assumptions/evidence/decision.
 * Computes the initial integrity score and records the first Check row.
 */
export async function createThesis(
  input: DecomposedThesis & { actor: string },
): Promise<string> {
  const initialScore = computeIntegrityScore(
    input.assumptions.map((a) => ({ criticality: a.criticality, status: "holding" })),
  );

  const thesis = await prisma.thesis.create({
    data: {
      actor: input.actor,
      claim: input.claim,
      direction: input.direction,
      horizon: input.horizon,
      conviction: input.conviction,
      integrityScore: initialScore,
      decision: {
        create: { action: input.decision.action, sizing: input.decision.sizing },
      },
      assumptions: {
        create: input.assumptions.map((a) => ({
          text: a.text,
          criticality: a.criticality,
          status: "holding",
          evidence: {
            create: a.evidence.map((e) => ({ text: e.text, source: e.source })),
          },
        })),
      },
      checks: { create: { score: initialScore } },
    },
  });
  return thesis.id;
}

export { prisma };
