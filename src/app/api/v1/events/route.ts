import { NextResponse } from "next/server";
import { readJson } from "@/lib/server/http";
import { appendEvent, json, requireMember } from "@/lib/server/session";
import { createRateLimiter } from "@/lib/security/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const limiter = createRateLimiter({ limit: 120, windowMs: 60_000 });

/** POST /api/v1/events { action, resource, details? } — append to the audit log as the signed-in user. */
export async function POST(req: Request) {
  const s = await requireMember();
  if (s instanceof NextResponse) return s;
  if (!limiter.check(s.userId).allowed) return json({ error: "Too many requests" }, 429);
  const body = await readJson(req, 4_000);
  if (body instanceof NextResponse) return body;
  const { action, resource, details } = body as { action?: unknown; resource?: unknown; details?: unknown };
  if (typeof action !== "string" || typeof resource !== "string" || !action || !resource) return json({ error: "action and resource are required" }, 400);
  await appendEvent(s, action, resource, typeof details === "string" ? details : undefined);
  return json({ ok: true }, 201);
}
