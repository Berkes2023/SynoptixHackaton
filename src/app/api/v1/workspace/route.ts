import { NextResponse } from "next/server";
import { WorkflowRunSchema } from "@/lib/agents/contracts";
import { readJson } from "@/lib/server/http";
import { requireMember, json } from "@/lib/server/session";
import { normaliseDoc } from "@/lib/server/supabase-store";
import { checkWrite, MAX_DOC_BYTES } from "@/lib/workspace/doc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/workspace — the active organisation's workspace, recent audit log and workflows. */
export async function GET() {
  const s = await requireMember();
  if (s instanceof NextResponse) return s;
  const org = s.active.organisationId;
  const [ws, events, workflows] = await Promise.all([
    s.supabase.from("workspaces").select("state, version").eq("organisation_id", org).single(),
    s.supabase.from("audit_events").select("id, at, actor_label, action, resource, details").eq("organisation_id", org).order("at", { ascending: false }).limit(500),
    s.supabase.from("workflows").select("run").eq("organisation_id", org).order("created_at", { ascending: false }).limit(50),
  ]);
  if (ws.error || !ws.data) return json({ error: "Workspace unavailable" }, 500);
  return json({
    version: ws.data.version,
    doc: normaliseDoc(ws.data.state),
    organisation: { id: org, name: s.active.organisationName },
    me: { id: s.userId, email: s.email, name: s.active.displayName, role: s.active.role },
    events: (events.data ?? []).reverse().map((e) => ({ id: `evt_${e.id}`, at: e.at, actor: e.actor_label, action: e.action, resource: e.resource, details: e.details ?? undefined })),
    workflows: (workflows.data ?? []).flatMap((w) => {
      const p = WorkflowRunSchema.safeParse(w.run);
      return p.success ? [p.data] : [];
    }).reverse(),
  });
}

/**
 * PUT /api/v1/workspace { baseVersion, doc } — optimistic write. 409 returns
 * the current version so the client can merge and retry; 403 when the role
 * may not change a section it touched.
 */
export async function PUT(req: Request) {
  const s = await requireMember(["Admin", "Auditor", "Reviewer"]);
  if (s instanceof NextResponse) return s;
  const body = await readJson(req, MAX_DOC_BYTES + 10_000);
  if (body instanceof NextResponse) return body;
  const { baseVersion, doc } = body as { baseVersion?: number; doc?: unknown };
  if (typeof baseVersion !== "number" || !doc || typeof doc !== "object") return json({ error: "baseVersion and doc are required" }, 400);

  const org = s.active.organisationId;
  const current = await s.supabase.from("workspaces").select("state, version").eq("organisation_id", org).single();
  if (current.error || !current.data) return json({ error: "Workspace unavailable" }, 500);
  const serverDoc = normaliseDoc(current.data.state);
  if (current.data.version !== baseVersion) return json({ error: "conflict", version: current.data.version, doc: serverDoc }, 409);

  const next = normaliseDoc(doc);
  const denied = checkWrite(s.active.role, serverDoc, next);
  if (denied) return json({ error: denied }, 403);

  const { data, error } = await s.supabase.from("workspaces").update({ state: next, updated_by: s.userId }).eq("organisation_id", org).eq("version", baseVersion).select("version");
  if (error) return json({ error: "Save failed" }, 500);
  if (!data?.length) {
    const latest = await s.supabase.from("workspaces").select("state, version").eq("organisation_id", org).single();
    return json({ error: "conflict", version: latest.data?.version, doc: normaliseDoc(latest.data?.state) }, 409);
  }
  return json({ version: data[0].version });
}
