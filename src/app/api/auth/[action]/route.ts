import { NextResponse } from "next/server";
import { ACTIVE_ORG_COOKIE, LOCAL_MODE_COOKIE } from "@/lib/supabase/config";
import { createSupabase } from "@/lib/supabase/server";
import { readJson, safeNext } from "@/lib/server/http";
import { json } from "@/lib/server/session";
import { clientKey, createRateLimiter } from "@/lib/security/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const limiter = createRateLimiter({ limit: 10, windowMs: 10 * 60_000 });
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * POST /api/auth/:action — sign-in, sign-up, magic-link, sign-out, local-demo.
 * Credentials go from the browser to this route and on to Supabase Auth over
 * TLS; they are never stored or logged here. Errors are generic so the
 * responses do not reveal which emails have accounts.
 */
export async function POST(req: Request, { params }: { params: Promise<{ action: string }> }) {
  const { action } = await params;

  if (action === "local-demo") {
    const res = json({ ok: true });
    res.cookies.set(LOCAL_MODE_COOKIE, "local", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 30 });
    return res;
  }

  const supabase = await createSupabase();
  if (action === "sign-out") {
    await supabase?.auth.signOut();
    const res = json({ ok: true });
    res.cookies.delete(LOCAL_MODE_COOKIE);
    res.cookies.delete(ACTIVE_ORG_COOKIE);
    return res;
  }
  if (!supabase) return json({ error: "Accounts are not enabled on this deployment" }, 503);

  const rl = limiter.check(`${action}:${clientKey(req)}`);
  if (!rl.allowed) return json({ error: "Too many attempts. Try again in a few minutes." }, 429);

  const body = await readJson(req, 2_000);
  if (body instanceof NextResponse) return body;
  const b = body as { email?: string; password?: string; next?: string };
  const email = (b.email ?? "").trim().toLowerCase();
  if (!EMAIL.test(email)) return json({ error: "Enter a valid email address" }, 400);
  const callback = `${new URL(req.url).origin}/auth/callback?next=${encodeURIComponent(safeNext(b.next))}`;
  const unavailable = (e: { name?: string; status?: number }) => e.name === "AuthRetryableFetchError" || !e.status || e.status >= 500;

  if (action === "sign-in") {
    const { error } = await supabase.auth.signInWithPassword({ email, password: b.password ?? "" });
    if (error && unavailable(error)) return json({ error: "The sign-in service is unavailable. Try again shortly." }, 503);
    if (error) return json({ error: /confirm/i.test(error.message) ? "Confirm your email address first — check your inbox." : "Email or password is incorrect" }, 401);
    return json({ ok: true, next: safeNext(b.next) });
  }

  if (action === "sign-up") {
    const password = b.password ?? "";
    if (password.length < 10) return json({ error: "Use a password of at least 10 characters" }, 400);
    const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${new URL(req.url).origin}/auth/callback?next=/onboarding` } });
    if (error) return json({ error: /password/i.test(error.message) ? error.message : "Could not create the account" }, 400);
    // With email confirmation on (recommended) there is no session until the link is clicked.
    return json({ ok: true, confirm: !data.session });
  }

  if (action === "magic-link") {
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: callback, shouldCreateUser: false } });
    // Same response whether or not the account exists.
    if (error && !/signups not allowed|not found/i.test(error.message)) return json({ error: "Could not send the link" }, 400);
    return json({ ok: true });
  }

  return json({ error: "Unknown action" }, 404);
}
