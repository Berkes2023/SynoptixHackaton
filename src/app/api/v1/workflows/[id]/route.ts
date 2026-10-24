import { NextResponse } from "next/server";
import { errorResponse, readJson } from "@/lib/server/http";
import { json, requireMember } from "@/lib/server/session";
import { callerOf, supabaseStore } from "@/lib/server/supabase-store";
import { advanceWorkflow, cancelWorkflow, decideWorkflow } from "@/lib/server/workflow-service";
import { newId } from "@/lib/state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/v1/workflows/:id
 *   { action: "advance", stepThrough }
 *   { action: "decide", decision: "approved" | "rejected", rationale }
 *   { action: "cancel" }
 * The acting user always comes from the session, never from the body.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await requireMember();
  if (s instanceof NextResponse) return s;
  const body = await readJson(req, 6_000);
  if (body instanceof NextResponse) return body;
  const b = body as { action?: string; stepThrough?: boolean; decision?: unknown; rationale?: unknown };
  const store = supabaseStore(s);
  const caller = callerOf(s);
  try {
    if (b.action === "advance") return json({ run: await advanceWorkflow(store, caller, id, Boolean(b.stepThrough), newId) });
    if (b.action === "decide") return json({ run: await decideWorkflow(store, caller, id, b.decision, b.rationale, newId) });
    if (b.action === "cancel") return json({ run: await cancelWorkflow(store, caller, id) });
    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    return errorResponse(e);
  }
}
