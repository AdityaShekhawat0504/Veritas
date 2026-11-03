// POST: run numeric checks for one thesis now, as the signed-in user.
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { dataSourcesFromEnv } from "@/lib/data/env";
import { errorResponse, unauthorized } from "@/lib/http";
import { runNumericChecks } from "@/lib/jobs/numericChecks";
import { currentActor } from "@/lib/queries";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const db = getDb();
    const actor = await currentActor(db);
    if (!actor) return unauthorized();
    const s = await runNumericChecks(db, dataSourcesFromEnv(), { thesisId: id, trigger: "manual", actor });
    return NextResponse.json({
      checks: s.checks.map((c) => ({ assumptionId: c.assumptionId, verdict: c.verdict, changed: c.alertId !== null })),
      killCriteriaTriggered: s.killCriteriaTriggered.length,
      skipped: s.skipped,
    });
  } catch (err) {
    return errorResponse(err, "api/theses/check");
  }
}
