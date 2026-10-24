import { NextResponse } from "next/server";
import { readJson } from "@/lib/server/http";
import { appendEvent, json, requireMember } from "@/lib/server/session";
import type { Role } from "@/lib/state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROLES: Role[] = ["Admin", "Auditor", "Reviewer", "Read-only"];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** GET /api/v1/members — colleagues in the active organisation, plus pending invitations for Admins. */
export async function GET() {
  const s = await requireMember();
  if (s instanceof NextResponse) return s;
  const org = s.active.organisationId;
  const members = await s.supabase.from("memberships").select("user_id, role, display_name, created_at").eq("organisation_id", org).order("created_at");
  const invitations = s.active.role === "Admin" ? await s.supabase.from("invitations").select("id, email, role, created_at").eq("organisation_id", org).is("accepted_at", null).order("created_at") : { data: [] };
  return json({
    me: s.userId,
    members: (members.data ?? []).map((m) => ({ userId: m.user_id, role: m.role, displayName: m.display_name, since: m.created_at })),
    invitations: invitations.data ?? [],
  });
}

/**
 * Admin only (also enforced by RLS):
 *   POST   { email, role }         invite
 *   PATCH  { userId, role }        change a colleague's role
 *   DELETE { userId } | { invitationId }
 */
export async function POST(req: Request) {
  const s = await requireMember(["Admin"]);
  if (s instanceof NextResponse) return s;
  const body = await readJson(req, 2_000);
  if (body instanceof NextResponse) return body;
  const { email, role } = body as { email?: string; role?: Role };
  const e = (email ?? "").trim().toLowerCase();
  if (!EMAIL.test(e) || e.length > 254) return json({ error: "Enter a valid email address" }, 400);
  if (!role || !ROLES.includes(role)) return json({ error: "Choose a role" }, 400);
  const { error } = await s.supabase.from("invitations").insert({ organisation_id: s.active.organisationId, email: e, role, invited_by: s.userId });
  if (error) return json({ error: /duplicate|unique/i.test(error.message) ? "That email has already been invited" : "Could not create the invitation" }, 400);
  await appendEvent(s, "member.invited", `invitation:${e}`, role);
  return json({ ok: true }, 201);
}

export async function PATCH(req: Request) {
  const s = await requireMember(["Admin"]);
  if (s instanceof NextResponse) return s;
  const body = await readJson(req, 2_000);
  if (body instanceof NextResponse) return body;
  const { userId, role } = body as { userId?: string; role?: Role };
  if (!userId || !role || !ROLES.includes(role)) return json({ error: "userId and role are required" }, 400);
  if (userId === s.userId) return json({ error: "You cannot change your own role" }, 400);
  const { data } = await s.supabase.from("memberships").update({ role }).eq("organisation_id", s.active.organisationId).eq("user_id", userId).select("display_name");
  if (!data?.length) return json({ error: "Member not found" }, 404);
  await appendEvent(s, "member.role_changed", `member:${data[0].display_name}`, role);
  return json({ ok: true });
}

export async function DELETE(req: Request) {
  const s = await requireMember(["Admin"]);
  if (s instanceof NextResponse) return s;
  const body = await readJson(req, 2_000);
  if (body instanceof NextResponse) return body;
  const { userId, invitationId } = body as { userId?: string; invitationId?: string };
  const org = s.active.organisationId;
  if (invitationId) {
    const { data } = await s.supabase.from("invitations").delete().eq("organisation_id", org).eq("id", invitationId).select("email");
    if (!data?.length) return json({ error: "Invitation not found" }, 404);
    await appendEvent(s, "member.invitation_revoked", `invitation:${data[0].email}`);
    return json({ ok: true });
  }
  if (!userId) return json({ error: "userId or invitationId is required" }, 400);
  if (userId === s.userId) return json({ error: "You cannot remove yourself" }, 400);
  const { data } = await s.supabase.from("memberships").delete().eq("organisation_id", org).eq("user_id", userId).select("display_name");
  if (!data?.length) return json({ error: "Member not found" }, 404);
  await appendEvent(s, "member.removed", `member:${data[0].display_name}`);
  return json({ ok: true });
}
