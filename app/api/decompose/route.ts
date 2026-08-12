// POST memo -> structured thesis (LLM). The OpenAI key never leaves the server.

import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth";
import { decomposeMemo } from "@/lib/decompose";

export const runtime = "nodejs";
export const maxDuration = 60;

// Guard against pathological pastes. ~16k chars comfortably fits a long memo.
const MAX_MEMO_CHARS = 16_000;

export async function POST(req: Request) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

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

  if (memo.length > MAX_MEMO_CHARS) {
    return NextResponse.json(
      {
        error: `That memo is too long (${memo.length.toLocaleString()} characters). Please trim it to under ${MAX_MEMO_CHARS.toLocaleString()}.`,
      },
      { status: 413 },
    );
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
