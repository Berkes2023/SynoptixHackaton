import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ACTIVE_ORG_COOKIE } from "../supabase/config";
import { createSupabase } from "../supabase/server";
import type { Role } from "../state";

export interface Membership {
  organisationId: string;
  organisationName: string;
  role: Role;
  displayName: string;
}

export interface CloudSession {
  supabase: SupabaseClient;
  userId: string;
  email: string;
  memberships: Membership[];
  /** The organisation in use; null until the user creates or joins one. */
  active: Membership | null;
}

/** The signed-in user and their organisations, or null when signed out / not configured. */
export async function getCloudSession(): Promise<CloudSession | null> {
  const supabase = await createSupabase();
  if (!supabase) return null;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("memberships").select("organisation_id, role, display_name, organisations(name)").eq("user_id", user.id).order("created_at");
  const memberships: Membership[] = (data ?? []).map((m) => ({
    organisationId: m.organisation_id as string,
    organisationName: ((m.organisations as unknown as { name: string } | null)?.name ?? "Organisation") as string,
    role: m.role as Role,
    displayName: m.display_name as string,
  }));
  const wanted = (await cookies()).get(ACTIVE_ORG_COOKIE)?.value;
  const active = memberships.find((m) => m.organisationId === wanted) ?? memberships[0] ?? null;
  return { supabase, userId: user.id, email: user.email ?? "", memberships, active };
}

export const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

export type ActiveSession = CloudSession & { active: Membership };

/** Resolves the session for an API route, or the error response to return. */
export async function requireMember(roles?: Role[]): Promise<ActiveSession | NextResponse> {
  const s = await getCloudSession();
  if (!s) return json({ error: "Not signed in" }, 401);
  if (!s.active) return json({ error: "Create or join an organisation first" }, 403);
  if (roles && !roles.includes(s.active.role)) return json({ error: `${s.active.role} may not do this` }, 403);
  return s as ActiveSession;
}

export const actorLabel = (s: ActiveSession) => `${s.active.displayName} (${s.active.role})`;

/** Appends to the organisation's audit log; the actor is always the signed-in user. */
export async function appendEvent(s: ActiveSession, action: string, resource: string, details?: string) {
  await s.supabase.from("audit_events").insert({ organisation_id: s.active.organisationId, actor_label: actorLabel(s), action: action.slice(0, 120), resource: resource.slice(0, 200), details: details?.slice(0, 2000) ?? null });
}
