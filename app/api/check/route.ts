// POST { thesisId } -> re-check the thesis's assumptions against current reality
// and persist the new statuses + recomputed integrity score. Scoped to the
// signed-in user; all DB access goes through lib/db.ts.

import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth";
import { getThesisById, applyCheckResults } from "@/lib/db";
import type { AssumptionCheckUpdate } from "@/lib/db";
import { checkAssumption } from "@/lib/check";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  let thesisId: unknown;
  try {
    const body = await req.json();
    thesisId = body?.thesisId;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (typeof thesisId !== "string" || thesisId.trim().length === 0) {
    return NextResponse.json({ error: "A thesisId is required." }, { status: 400 });
  }

  const thesis = await getThesisById(thesisId, userId);
  if (!thesis) {
    return NextResponse.json({ error: "Thesis not found." }, { status: 404 });
  }
  if (thesis.assumptions.length === 0) {
    return NextResponse.json(
      { error: "This thesis has no assumptions to check." },
      { status: 400 },
    );
  }

  // Check every assumption in parallel. Settle rather than fail-fast: an
  // individual model hiccup leaves that assumption's prior status untouched
  // instead of sinking the whole re-check.
  const settled = await Promise.allSettled(
    thesis.assumptions.map(async (a) => {
      const result = await checkAssumption({
        claim: thesis.claim,
        direction: thesis.direction,
        horizon: thesis.horizon,
        assumption: { text: a.text, criticality: a.criticality },
        evidence: a.evidence.map((e) => ({ text: e.text, source: e.source })),
      });
      return { assumptionId: a.id, ...result } satisfies AssumptionCheckUpdate;
    }),
  );

  const updates = settled
    .filter(
      (s): s is PromiseFulfilledResult<AssumptionCheckUpdate> =>
        s.status === "fulfilled",
    )
    .map((s) => s.value);

  if (updates.length === 0) {
    return NextResponse.json(
      { error: "The check could not be completed. Please try again." },
      { status: 502 },
    );
  }

  try {
    const updated = await applyCheckResults(thesisId, userId, updates);
    if (!updated) {
      return NextResponse.json({ error: "Thesis not found." }, { status: 404 });
    }
    return NextResponse.json({
      integrityScore: updated.integrityScore,
      checked: updates.length,
      total: thesis.assumptions.length,
    });
  } catch (err) {
    console.error("[/api/check] persist failed:", err);
    return NextResponse.json(
      { error: "Failed to save the check results." },
      { status: 500 },
    );
  }
}
