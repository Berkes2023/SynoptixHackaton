import { NextResponse } from "next/server";
import { ACTIVE_ORG_COOKIE, isSupabaseConfigured } from "@/lib/supabase/config";
import { readJson } from "@/lib/server/http";
import { getCloudSession, json } from "@/lib/server/session";
import { initialState } from "@/lib/state";
import { toDoc } from "@/lib/workspace/doc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COOKIE = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 180 };

/** GET /api/v1/session — who is signed in and which organisations they belong to. */
export async function GET() {
  if (!isSupabaseConfigured()) return json({ configured: false, user: null });
  let s = await getCloudSession();
  if (!s) return json({ configured: true, user: null });
  // Join any organisation that invited this (confirmed) email address.
  const { data: joined } = await s.supabase.rpc("accept_invitations", { display_name: s.email.split("@")[0] });
  if (joined) s = (await getCloudSession())!;
  return json({ configured: true, user: { id: s.userId, email: s.email }, memberships: s.memberships, active: s.active });
}

/**
 * POST /api/v1/session
 *   { action: "create_organisation", name, displayName }
 *   { action: "switch", organisationId }
 */
export async function POST(req: Request) {
  const s = await getCloudSession();
  if (!s) return json({ error: "Not signed in" }, 401);
  const body = await readJson(req, 4_000);
  if (body instanceof NextResponse) return body;
  const b = body as { action?: string; name?: string; displayName?: string; organisationId?: string };

  if (b.action === "create_organisation") {
    const name = (b.name ?? "").trim();
    const displayName = (b.displayName ?? "").trim();
    if (name.length < 2 || name.length > 120) return json({ error: "Organisation name must be 2–120 characters" }, 400);
    if (displayName.length < 1 || displayName.length > 120) return json({ error: "Your name is required" }, 400);
    const { data, error } = await s.supabase.rpc("create_organisation", { org_name: name, display_name: displayName, initial_state: toDoc(initialState()) });
    if (error) return json({ error: /quota/.test(error.message) ? "You have reached the limit of 3 organisations" : "Could not create the organisation" }, 400);
    const res = json({ organisationId: data });
    res.cookies.set(ACTIVE_ORG_COOKIE, String(data), COOKIE);
    return res;
  }

  if (b.action === "switch") {
    if (!s.memberships.some((m) => m.organisationId === b.organisationId)) return json({ error: "Not a member of that organisation" }, 403);
    const res = json({ organisationId: b.organisationId });
    res.cookies.set(ACTIVE_ORG_COOKIE, String(b.organisationId), COOKIE);
    return res;
  }

  return json({ error: "Unknown action" }, 400);
}
