// POST memo -> structured thesis (LLM). The OpenAI key never leaves the server.

import { NextResponse } from "next/server";
import { decomposeMemo } from "@/lib/decompose";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let memo: unknown;
  try {
    const body = await req.json();
    memo = body?.memo;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (typeof memo !== "string" || memo.trim().length === 0) {
    return NextResponse.json({ error: "A memo is required." }, { status: 400 });
  }

  try {
    const thesis = await decomposeMemo(memo);
    return NextResponse.json({ thesis });
  } catch (err) {
    console.error("[/api/decompose] failed:", err);
    const message =
      err instanceof Error ? err.message : "Decomposition failed unexpectedly.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
