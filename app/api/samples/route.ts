// POST -> clone the demo sample theses into the signed-in user's account.
// Only clones onto an empty dashboard so it can't be used to duplicate data.

import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth";
import { userHasTheses, cloneSamplesForUser } from "@/lib/db";

export const runtime = "nodejs";

export async function POST() {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  if (await userHasTheses(userId)) {
    return NextResponse.json(
      { error: "You already have theses." },
      { status: 409 },
    );
  }

  try {
    const count = await cloneSamplesForUser(userId);
    return NextResponse.json({ count });
  } catch (err) {
    console.error("[/api/samples] failed:", err);
    return NextResponse.json(
      { error: "Failed to load the samples." },
      { status: 500 },
    );
  }
}
