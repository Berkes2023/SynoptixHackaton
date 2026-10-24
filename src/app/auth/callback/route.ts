import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createSupabase } from "@/lib/supabase/server";
import { safeNext } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Landing point for confirmation and magic-link emails: exchanges the one-time code for a session. */
export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const next = safeNext(url.searchParams.get("next"));
  const supabase = await createSupabase();
  const fail = NextResponse.redirect(new URL("/login?error=link", url.origin));
  if (!supabase) return fail;

  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const { error } = code ? await supabase.auth.exchangeCodeForSession(code) : tokenHash && type ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type }) : { error: new Error("missing code") };
  if (error) return fail;
  return NextResponse.redirect(new URL(next, url.origin));
}
