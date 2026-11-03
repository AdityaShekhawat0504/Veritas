// POST multipart form: ticker, optional cik, and either memo text or a file.
// Drafts a thesis through the LLM gateway and saves it as a draft.
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { draftThesisFromMemo } from "@/lib/intake/draft";
import { extractMemoText } from "@/lib/intake/text";
import { gatewayFromEnv } from "@/lib/llm/env";
import { errorResponse, unauthorized } from "@/lib/http";
import { currentActor } from "@/lib/queries";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const db = getDb();
    const actor = await currentActor(db);
    if (!actor) return unauthorized();

    const form = await req.formData();
    const ticker = String(form.get("ticker") ?? "").trim();
    const cik = String(form.get("cik") ?? "").trim() || null;
    let memoText = String(form.get("memo") ?? "");
    const file = form.get("file");
    if (file && typeof file !== "string" && file.size > 0) {
      if (file.size > 10 * 1024 * 1024) {
        return NextResponse.json({ error: "Files up to 10 MB are supported." }, { status: 400 });
      }
      memoText = await extractMemoText({
        name: file.name,
        type: file.type,
        bytes: new Uint8Array(await file.arrayBuffer()),
      });
    }
    if (!ticker) return NextResponse.json({ error: "Ticker is required." }, { status: 400 });

    const { thesisId, draft } = await draftThesisFromMemo(db, actor, gatewayFromEnv(db), { ticker, cik, memoText });
    return NextResponse.json({ thesisId, dropped: draft.dropped });
  } catch (err) {
    return errorResponse(err, "api/extract");
  }
}
