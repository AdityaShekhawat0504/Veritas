// POST the reviewed extraction; saves it through confirmExtraction.
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { confirmExtraction } from "@/lib/actions";
import { errorResponse, unauthorized } from "@/lib/http";
import { currentActor } from "@/lib/queries";

export const runtime = "nodejs";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const db = getDb();
    const actor = await currentActor(db);
    if (!actor) return unauthorized();
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    const snapshot = await confirmExtraction(db, actor, { ...body, thesisId: id } as Parameters<typeof confirmExtraction>[2]);
    return NextResponse.json({ thesisId: snapshot.thesis.id, version: 1 });
  } catch (err) {
    return errorResponse(err, "api/theses/confirm");
  }
}
