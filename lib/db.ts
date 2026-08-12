// Data access layer. The rest of the app talks to the DB ONLY through here —
// no component, page, or route handler imports PrismaClient directly.
//
// v1: every query is scoped by userId. A user can only ever read or mutate
// their own theses; ownership is enforced here, not just in the UI.

import { PrismaClient } from "@prisma/client";
import type {
  ThesisCardData,
  ThesisWithRelations,
  DecomposedThesis,
  AssumptionStatus,
} from "./types";
import { computeIntegrityScore } from "./score";
import { SAMPLE_THESES, buildSampleCreateData } from "./sampleTheses";

// Singleton — avoid exhausting connections under Next.js hot-reload.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
const prisma = globalForPrisma.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

/** Dashboard: the user's theses, sorted by integrity ascending (breaks float to top). */
export async function getThesesForDashboard(
  userId: string,
): Promise<ThesisCardData[]> {
  const theses = await prisma.thesis.findMany({
    where: { userId },
    orderBy: [{ integrityScore: "asc" }, { updatedAt: "desc" }],
    include: {
      assumptions: { select: { criticality: true, status: true } },
    },
  });
  return theses as ThesisCardData[];
}

/** Detail page: one of the user's theses with all relations, or null if not theirs. */
export async function getThesisById(
  id: string,
  userId: string,
): Promise<ThesisWithRelations | null> {
  const thesis = await prisma.thesis.findFirst({
    where: { id, userId },
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
 * Persist a decomposed thesis (+ nested assumptions/evidence/decision) for a
 * user. Computes the initial integrity score and records the first Check row.
 */
export async function createThesis(
  input: DecomposedThesis & { actor: string },
  userId: string,
): Promise<string> {
  const initialScore = computeIntegrityScore(
    input.assumptions.map((a) => ({ criticality: a.criticality, status: "holding" })),
  );

  const thesis = await prisma.thesis.create({
    data: {
      userId,
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

export interface AssumptionCheckUpdate {
  assumptionId: string;
  status: AssumptionStatus;
  reason: string;
  source: string | null;
}

/**
 * Apply a batch of per-assumption check results to one of the user's theses:
 * update each assumption's status/reason/source/lastChecked, recompute the
 * integrity score, and record a new Check row. Returns the refreshed thesis,
 * or null if the thesis isn't the user's.
 */
export async function applyCheckResults(
  thesisId: string,
  userId: string,
  results: AssumptionCheckUpdate[],
): Promise<ThesisWithRelations | null> {
  const thesis = await prisma.thesis.findFirst({
    where: { id: thesisId, userId },
    include: { assumptions: { select: { id: true, criticality: true, status: true } } },
  });
  if (!thesis) return null;

  // Only accept results for assumptions that actually belong to this thesis.
  const owned = new Map(thesis.assumptions.map((a) => [a.id, a]));
  const applicable = results.filter((r) => owned.has(r.assumptionId));
  const byId = new Map(applicable.map((r) => [r.assumptionId, r]));
  const now = new Date();

  // The recomputed score uses each assumption's *new* status where checked.
  const nextScore = computeIntegrityScore(
    thesis.assumptions.map((a) => ({
      criticality: a.criticality as "critical" | "supporting",
      status: (byId.get(a.id)?.status ?? a.status) as AssumptionStatus,
    })),
  );

  await prisma.$transaction([
    ...applicable.map((r) =>
      prisma.assumption.update({
        where: { id: r.assumptionId },
        data: {
          status: r.status,
          reason: r.reason,
          source: r.source,
          lastChecked: now,
        },
      }),
    ),
    prisma.check.create({ data: { thesisId, score: nextScore } }),
    prisma.thesis.update({
      where: { id: thesisId },
      data: { integrityScore: nextScore },
    }),
  ]);

  return getThesisById(thesisId, userId);
}

/** True if the user already has at least one thesis (drives the empty state). */
export async function userHasTheses(userId: string): Promise<boolean> {
  const count = await prisma.thesis.count({ where: { userId } });
  return count > 0;
}

/**
 * Clone the demo sample theses into the user's own account (the "Load samples"
 * action). No-op-safe to call, but the caller should gate on an empty dashboard.
 * Returns the number of theses created.
 */
export async function cloneSamplesForUser(userId: string): Promise<number> {
  await prisma.$transaction(
    SAMPLE_THESES.map((sample) =>
      prisma.thesis.create({ data: buildSampleCreateData(sample, userId) }),
    ),
  );
  return SAMPLE_THESES.length;
}

export { prisma };
