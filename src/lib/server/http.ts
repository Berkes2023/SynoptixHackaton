import { NextResponse } from "next/server";
import { ServiceError } from "./workflow-service";

/** Parses a JSON body with a size cap. Returns the error response instead when invalid. */
export async function readJson(req: Request, maxBytes: number): Promise<unknown | NextResponse> {
  const text = await req.text();
  if (text.length > maxBytes) return NextResponse.json({ error: "Request too large" }, { status: 413 });
  try {
    return JSON.parse(text || "{}");
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
  }
}

/** Maps service and database errors to JSON responses without leaking internals. */
export function errorResponse(e: unknown) {
  if (e instanceof ServiceError) return NextResponse.json({ error: e.message }, { status: e.status });
  console.error(e);
  return NextResponse.json({ error: "Request failed" }, { status: 500 });
}

/** Only same-site relative paths are allowed as post-login destinations. */
export function safeNext(next: string | null | undefined, fallback = "/dashboard"): string {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : fallback;
}
