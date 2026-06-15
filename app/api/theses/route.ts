// POST a confirmed (decomposed + edited) thesis -> persist via the data layer.
// All DB access goes through lib/db.ts; this route never touches Prisma.

import { NextResponse } from "next/server";
import { createThesis } from "@/lib/db";
import type {
  DecomposedThesis,
  Direction,
  Conviction,
  Criticality,
} from "@/lib/types";

export const runtime = "nodejs";

const DIRECTIONS: Direction[] = ["long", "short", "hold"];
const CONVICTIONS: Conviction[] = ["low", "medium", "high"];
const CRITICALITIES: Criticality[] = ["critical", "supporting"];

function validate(body: unknown): (DecomposedThesis & { actor: string }) | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as Record<string, unknown>;

  if (typeof b.actor !== "string" || b.actor.trim().length === 0) return null;
  if (typeof b.claim !== "string" || b.claim.trim().length === 0) return null;
  if (typeof b.horizon !== "string") return null;
  if (!DIRECTIONS.includes(b.direction as Direction)) return null;
  if (!CONVICTIONS.includes(b.conviction as Conviction)) return null;

  const decision = b.decision as Record<string, unknown> | undefined;
  if (!decision || typeof decision.action !== "string") return null;

  if (!Array.isArray(b.assumptions)) return null;
  for (const a of b.assumptions) {
    if (typeof a?.text !== "string") return null;
    if (!CRITICALITIES.includes(a?.criticality)) return null;
    if (!Array.isArray(a?.evidence)) return null;
  }

  return body as DecomposedThesis & { actor: string };
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const input = validate(body);
  if (!input) {
    return NextResponse.json(
      { error: "The thesis is missing required fields." },
      { status: 400 },
    );
  }

  try {
    const id = await createThesis(input);
    return NextResponse.json({ id });
  } catch (err) {
    console.error("[/api/theses] failed:", err);
    return NextResponse.json({ error: "Failed to save the thesis." }, { status: 500 });
  }
}
