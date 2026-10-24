import { NextResponse } from "next/server";
import { WorkflowRunSchema } from "@/lib/agents/contracts";
import { errorResponse, readJson } from "@/lib/server/http";
import { json, requireMember } from "@/lib/server/session";
import { callerOf, supabaseStore } from "@/lib/server/supabase-store";
import { startWorkflow } from "@/lib/server/workflow-service";
import { newId } from "@/lib/state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Per-organisation quota on new workflows. */
const DAILY_WORKFLOW_LIMIT = 100;

/** GET /api/v1/workflows — the organisation's most recent workflows. */
export async function GET() {
  const s = await requireMember();
  if (s instanceof NextResponse) return s;
  const { data } = await s.supabase.from("workflows").select("run").eq("organisation_id", s.active.organisationId).order("created_at", { ascending: false }).limit(50);
  return json({ workflows: (data ?? []).flatMap((w) => (WorkflowRunSchema.safeParse(w.run).success ? [w.run] : [])) });
}

/** POST /api/v1/workflows { request, stepThrough } — start and run a workflow on the server. */
export async function POST(req: Request) {
  const s = await requireMember(["Admin", "Auditor"]);
  if (s instanceof NextResponse) return s;
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const { count } = await s.supabase.from("workflows").select("id", { count: "exact", head: true }).eq("organisation_id", s.active.organisationId).gte("created_at", since);
  if ((count ?? 0) >= DAILY_WORKFLOW_LIMIT) return json({ error: `Daily limit of ${DAILY_WORKFLOW_LIMIT} workflows reached for this organisation` }, 429);
  const body = await readJson(req, 10_000);
  if (body instanceof NextResponse) return body;
  try {
    return json({ run: await startWorkflow(supabaseStore(s), callerOf(s), body, newId) }, 201);
  } catch (e) {
    return errorResponse(e);
  }
}
