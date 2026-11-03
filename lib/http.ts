import { NextResponse } from "next/server";
import { ActionError, httpStatusFor } from "@/lib/actions";
import { LlmError } from "@/lib/llm";
import { UnsupportedFileError } from "@/lib/intake/text";

/** Map known errors to JSON responses; log and hide anything else. */
export function errorResponse(err: unknown, route: string): NextResponse {
  if (err instanceof ActionError) {
    return NextResponse.json({ error: err.message, details: err.details }, { status: httpStatusFor(err) });
  }
  if (err instanceof UnsupportedFileError) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
  if (err instanceof LlmError) {
    console.error(`[${route}]`, err);
    return NextResponse.json({ error: "The language model call failed. Try again." }, { status: 502 });
  }
  console.error(`[${route}]`, err);
  return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
}

export function unauthorized(): NextResponse {
  return NextResponse.json({ error: "Not signed in." }, { status: 401 });
}
