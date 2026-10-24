import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/LoginForm";
import { getCloudSession } from "@/lib/server/session";
import { safeNext } from "@/lib/server/http";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  const configured = isSupabaseConfigured();
  if (configured && (await getCloudSession())) redirect(safeNext(next));
  return <LoginForm configured={configured} next={safeNext(next)} linkError={error === "link"} />;
}
