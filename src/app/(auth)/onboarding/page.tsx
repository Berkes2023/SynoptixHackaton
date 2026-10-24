import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { OnboardingForm } from "@/components/auth/OnboardingForm";
import { getCloudSession } from "@/lib/server/session";

export const metadata: Metadata = { title: "Set up your organisation" };
export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  let s = await getCloudSession();
  if (!s) redirect("/login?next=/onboarding");
  if (!s.active) {
    // An invitation may be waiting for this address.
    const { data: joined } = await s.supabase.rpc("accept_invitations", { display_name: s.email.split("@")[0] });
    if (joined) s = await getCloudSession();
  }
  if (s?.active) redirect("/dashboard");
  return <OnboardingForm email={s?.email ?? ""} />;
}
